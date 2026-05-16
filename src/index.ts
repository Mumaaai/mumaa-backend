import { Hono } from 'hono'
import { cors } from 'hono/cors'
import opsRoutes from './opsboard'

type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Helper for hashing passwords with Web Crypto
async function hashPassword(password: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Enable CORS
app.use('*', cors({
  origin: '*', 
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Staff-ID'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

app.get('/', (c) => {
  return c.json({
    message: 'Welcome to Mumaa AI API',
    status: 'online'
  })
})

/**
 * Standard Signup
 */
app.post('/auth/signup', async (c) => {
  const { email, password, fullName } = await c.req.json()
  
  if (!email || !password || !fullName) {
    return c.json({ error: 'All fields are required' }, 400)
  }

  try {
    const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email)
      .first()

    if (existingUser) {
      return c.json({ error: 'Email already exists' }, 400)
    }

    const userId = crypto.randomUUID()
    const hashedPassword = await hashPassword(password)

    await c.env.DB.prepare(
      'INSERT INTO users (id, email, full_name, hashed_password) VALUES (?, ?, ?, ?)'
    ).bind(userId, email, fullName, hashedPassword).run()

    return c.json({
      message: 'User created successfully',
      user: { id: userId, email, name: fullName }
    })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Standard Signin
 */
app.post('/auth/signin', async (c) => {
  const { email, password } = await c.req.json()
  
  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400)
  }

  try {
    const hashedPassword = await hashPassword(password)
    const user = await c.env.DB.prepare('SELECT * * FROM users WHERE email = ? AND hashed_password = ?')
      .bind(email, hashedPassword)
      .first()

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    return c.json({
      message: 'Signed in successfully',
      user: { id: user.id, email: user.email, name: user.full_name }
    })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Authentication with Google
 */
app.post('/auth/google', async (c) => {
  const { id_token } = await c.req.json()
  
  if (!id_token) {
    return c.json({ error: 'Missing id_token' }, 400)
  }

  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`)
    const payload: any = await response.json()

    if (!response.ok || payload.aud !== c.env.GOOGLE_CLIENT_ID) {
      return c.json({ error: 'Invalid token' }, 401)
    }

    const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(payload.email)
      .first()

    let userId = user?.id

    if (!user) {
      userId = crypto.randomUUID()
      await c.env.DB.prepare(
        'INSERT INTO users (id, email, full_name, hashed_password) VALUES (?, ?, ?, ?)'
      ).bind(userId, payload.email, payload.name, 'google_auth_placeholder').run()
    }

    return c.json({
      message: 'Authenticated successfully',
      user: {
        id: userId,
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      }
    })
  } catch (err) {
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

/**
 * Baby Profile Endpoints
 */
app.get('/baby/:userId', async (c) => {
  const userId = c.req.param('userId')
  const baby = await c.env.DB.prepare('SELECT * FROM babies WHERE user_id = ?')
    .bind(userId)
    .first()
  
  return c.json(baby || { error: 'No baby profile found' })
})

app.post('/baby', async (c) => {
  const { 
    userId, name, dob, gender, bloodGroup, language, aiDetail, momName,
    deliveryType, parentingType, medicalConditions, birthWeight, momCondition
  } = await c.req.json()
  
  if (!userId || !name || !dob) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  try {
    const existingBaby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first()

    if (existingBaby) {
      await c.env.DB.prepare(
        `UPDATE babies SET 
          name = ?, date_of_birth = ?, gender = ?, blood_group = ?, 
          preferred_language = ?, ai_detail = ?, mom_name = ?,
          delivery_type = ?, parenting_type = ?, medical_conditions = ?,
          birth_weight = ?, mom_condition = ?
         WHERE user_id = ?`
      ).bind(
        name, dob, gender, bloodGroup, language, aiDetail, momName,
        deliveryType, parentingType, medicalConditions, birthWeight, momCondition,
        userId
      ).run()
      
      // Check if vaccinations need seeding
      const vaxCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM vaccinations WHERE baby_id = ?').bind(existingBaby.id).first<{count: number}>()
      if (vaxCount && vaxCount.count === 0) {
        await seedVaccinations(c.env.DB, existingBaby.id as string, dob)
      }

      // Check if milestones need seeding
      const milCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM milestones WHERE baby_id = ?').bind(existingBaby.id).first<{count: number}>()
      if (milCount && milCount.count === 0) {
        await seedMilestones(c.env.DB, existingBaby.id as string)
      }

      return c.json({ message: 'Profile updated' })
    } else {
      const babyId = crypto.randomUUID()
      await c.env.DB.prepare(
        `INSERT INTO babies (
          id, user_id, name, date_of_birth, gender, blood_group, 
          preferred_language, ai_detail, mom_name,
          delivery_type, parenting_type, medical_conditions,
          birth_weight, mom_condition
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        babyId, userId, name, dob, gender, bloodGroup, 
        language, aiDetail, momName,
        deliveryType, parentingType, medicalConditions,
        birthWeight, momCondition
      ).run()
      
      // Initialize schedule
      await seedVaccinations(c.env.DB, babyId, dob)
      await seedMilestones(c.env.DB, babyId)

      return c.json({ message: 'Profile created', id: babyId })
    }
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Database error' }, 500)
  }
})

async function seedVaccinations(db: D1Database, babyId: string, dob: string) {
  const birthDate = new Date(dob)
  const schedule = [
    { name: 'BCG', due: 0, desc: 'Tuberculosis' },
    { name: 'Hepatitis B - 1', due: 0, desc: 'Hepatitis B' },
    { name: 'OPV - 0', due: 0, desc: 'Polio' },
    { name: 'OPV - 1', due: 42, desc: 'Polio' },
    { name: 'Pentavalent - 1', due: 42, desc: 'DTP, Hep B, Hib' },
    { name: 'Rotavirus - 1', due: 42, desc: 'Rotavirus' },
    { name: 'PCV - 1', due: 42, desc: 'Pneumococcal' },
    { name: 'OPV - 2', due: 70, desc: 'Polio' },
    { name: 'Pentavalent - 2', due: 70, desc: 'DTP, Hep B, Hib' },
    { name: 'Rotavirus - 2', due: 70, desc: 'Rotavirus' },
    { name: 'PCV - 2', due: 70, desc: 'Pneumococcal' },
    { name: 'OPV - 3', due: 98, desc: 'Polio' },
    { name: 'Pentavalent - 3', due: 98, desc: 'DTP, Hep B, Hib' },
    { name: 'Rotavirus - 3', due: 98, desc: 'Rotavirus' },
    { name: 'PCV - 3', due: 98, desc: 'Pneumococcal' },
    { name: 'OPV - 4', due: 180, desc: 'Polio' },
    { name: 'Hepatitis B - 2', due: 180, desc: 'Hepatitis B' },
    { name: 'Vitamin A - 1', due: 270, desc: 'Vitamin A' },
    { name: 'MR - 1', due: 270, desc: 'Measles, Rubella' },
    { name: 'PCV Booster', due: 270, desc: 'Pneumococcal' },
    { name: 'Vitamin A - 2', due: 365, desc: 'Vitamin A' },
    { name: 'MR - 2', due: 450, desc: 'Measles, Rubella' },
    { name: 'DPT Booster - 1', due: 540, desc: 'Diphtheria, Pertussis, Tetanus' },
    { name: 'OPV - 5', due: 540, desc: 'Polio' }
  ]

  for (const v of schedule) {
    const dueDate = new Date(birthDate)
    dueDate.setDate(dueDate.getDate() + v.due)
    await db.prepare(
      'INSERT INTO vaccinations (id, baby_id, vaccine_name, due_date, status) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), babyId, v.name, dueDate.toISOString().split('T')[0], 'pending').run()
  }
}

async function seedMilestones(db: D1Database, babyId: string) {
  const milestones = [
    { name: 'First Social Smile', age: '0-3 months', badge: '😊', desc: 'Baby smiles in response to your smile' },
    { name: 'Follows Objects', age: '0-3 months', badge: '👀', desc: 'Tracks moving objects with eyes' },
    { name: 'Coos and Gurgles', age: '0-3 months', badge: '🗣️', desc: 'Makes cooing sounds' },
    { name: 'Holds Head Up', age: '0-3 months', badge: '💪', desc: 'Can hold head up briefly during tummy time' },
    { name: 'Rolls Over', age: '3-6 months', badge: '🔄', desc: 'Rolls from tummy to back or vice versa' },
    { name: 'Sits with Support', age: '3-6 months', badge: '🪑', desc: 'Can sit when propped up' },
    { name: 'Babbling', age: '6-9 months', badge: '💬', desc: 'Makes repetitive consonant sounds' },
    { name: 'Crawling', age: '9-12 months', badge: '🚶', desc: 'Moves around on hands and knees' }
  ]

  for (const m of milestones) {
    await db.prepare(
      'INSERT INTO milestones (id, baby_id, milestone_name, age_range, badge, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), babyId, m.name, m.age, m.badge, m.desc, 'pending').run()
  }
}

/**
 * Chat Endpoints
 */
app.get('/chat/sessions/:userId', async (c) => {
  const userId = c.req.param('userId')
  const sessions = await c.env.DB.prepare(
    'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(userId).all()
  
  // Backwards compatibility: if no sessions found in chat_sessions, check chat_messages
  if (sessions.results.length === 0) {
    const legacySessions = await c.env.DB.prepare(
      'SELECT DISTINCT session_id as id, MIN(created_at) as created_at FROM chat_messages WHERE user_id = ? GROUP BY session_id ORDER BY created_at DESC'
    ).bind(userId).all()
    return c.json(legacySessions.results)
  }

  return c.json(sessions.results)
})

app.get('/chat/history/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const messages = await c.env.DB.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC')
    .bind(sessionId)
    .all()
  return c.json(messages.results)
})

app.post('/chat/message', async (c) => {
  const { userId, sessionId, role, content } = await c.req.json()
  const id = crypto.randomUUID()
  
  // Ensure session exists
  const session = await c.env.DB.prepare('SELECT id FROM chat_sessions WHERE id = ?')
    .bind(sessionId)
    .first()

  if (!session) {
    await c.env.DB.prepare(
      'INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)'
    ).bind(sessionId, userId, 'New Chat').run()
  } else {
    // Update timestamp
    await c.env.DB.prepare(
      'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(sessionId).run()
  }

  await c.env.DB.prepare(
    'INSERT INTO chat_messages (id, user_id, session_id, role, content) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, sessionId, role, content).run()
  
  return c.json({ id, status: 'saved' })
})

app.put('/chat/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const { title } = await c.req.json()
  
  await c.env.DB.prepare(
    'UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(title, sessionId).run()
  
  return c.json({ status: 'updated' })
})

/**
 * Dashboard Aggregation
 */
app.get('/dashboard/:userId', async (c) => {
  const userId = c.req.param('userId')
  
  try {
    // 1. Get baby
    const baby = await c.env.DB.prepare('SELECT id, name, date_of_birth FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string, name: string, date_of_birth: string }>()

    if (!baby) {
      return c.json({ error: 'No baby profile found' }, 404)
    }

    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // 2. Aggregate today's stats
    const stats = await c.env.DB.prepare(`
      SELECT 
        activity_type,
        COUNT(*) as count,
        SUM(CASE WHEN activity_type = 'sleep' AND end_time IS NOT NULL THEN (strftime('%s', end_time) - strftime('%s', start_time)) ELSE 0 END) as total_seconds
      FROM activity_logs 
      WHERE baby_id = ? AND date(start_time) = ?
      GROUP BY activity_type
    `).bind(baby.id, today).all()

    const todayStats = {
      feedings: 0,
      sleepHours: 0
    }

    stats.results.forEach((r: any) => {
      if (r.activity_type === 'feeding') todayStats.feedings = Number(r.count)
      if (r.activity_type === 'sleep') todayStats.sleepHours = Math.round((Number(r.total_seconds) || 0) / 3600 * 10) / 10
    })

    // 3. Recent activity
    const recentActivity = await c.env.DB.prepare(`
      SELECT * FROM activity_logs 
      WHERE baby_id = ? 
      ORDER BY start_time DESC 
      LIMIT 10
    `).bind(baby.id).all()

    // 4. Next vaccine
    const nextVaccine = await c.env.DB.prepare(`
      SELECT vaccine_name, due_date FROM vaccinations 
      WHERE baby_id = ? AND status = 'pending' AND due_date >= ?
      ORDER BY due_date ASC 
      LIMIT 1
    `).bind(baby.id, today).first()

    // 5. Total milestones
    const milestonesCount = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM milestones 
      WHERE baby_id = ? AND status = 'achieved'
    `).bind(baby.id).first<{ count: number }>()

    return c.json({
      babyName: baby.name,
      babyDob: baby.date_of_birth,
      todayStats,
      recentActivity: recentActivity.results,
      nextVaccine,
      milestonesAchieved: milestonesCount?.count || 0
    })
  } catch (err) {
    console.error('Dashboard error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Activity Logs
 */
app.get('/logs/activity/:userId', async (c) => {
  const userId = c.req.param('userId')
  
  try {
    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) return c.json([])

    const today = new Date().toISOString().split('T')[0]
    const logs = await c.env.DB.prepare(`
      SELECT * FROM activity_logs 
      WHERE baby_id = ? AND date(start_time) = ?
      ORDER BY start_time DESC
    `).bind(baby.id, today).all()
    
    return c.json(logs.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

app.post('/logs/activity', async (c) => {
  const { babyId, type, detail, start, end, notes } = await c.req.json()
  const id = crypto.randomUUID()
  
  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, baby_id, activity_type, detail, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, babyId, type, detail, start, end, notes).run()
  
  return c.json({ id, status: 'logged' })
})

/**
 * Growth Tracker
 */
app.get('/growth/:userId', async (c) => {
  const userId = c.req.param('userId')
  console.log(`GET /growth for user: ${userId}`)
  try {
    // 1. Find the baby for this user
    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) {
      console.warn(`No baby found for user ${userId}`)
      return c.json([])
    }

    // 2. Fetch records for this baby
    const records = await c.env.DB.prepare(
      'SELECT * FROM growth_records WHERE baby_id = ? ORDER BY recorded_at ASC'
    ).bind(baby.id).all()
    
    console.log(`Found ${records.results.length} records for baby ${baby.id}`)
    return c.json(records.results)
  } catch (err) {
    console.error('GET /growth error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

app.post('/growth', async (c) => {
  try {
    const body = await c.req.json()
    console.log('POST /growth body:', body)
    const { userId, weight_kg, height_cm, recorded_at } = body
    
    // 1. Find the baby for this user
    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) {
      console.error(`No baby found for user ${userId} to attach growth record`)
      return c.json({ error: 'Baby profile not found' }, 404)
    }

    const id = crypto.randomUUID()
    await c.env.DB.prepare(
      'INSERT INTO growth_records (id, baby_id, weight_kg, height_cm, recorded_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, baby.id, weight_kg, height_cm, recorded_at).run()
    
    console.log(`Growth record ${id} saved for baby ${baby.id}`)
    return c.json({ id, status: 'saved' })
  } catch (err) {
    console.error('POST /growth error:', err)
    return c.json({ error: 'Database error or invalid JSON' }, 500)
  }
})

/**
 * Vaccinations
 */
app.get('/vaccinations/:userId', async (c) => {
  const userId = c.req.param('userId')
  try {
    const baby = await c.env.DB.prepare('SELECT id, date_of_birth FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string, date_of_birth: string }>()

    if (!baby) return c.json([])

    let list = await c.env.DB.prepare('SELECT * FROM vaccinations WHERE baby_id = ? ORDER BY due_date ASC')
      .bind(baby.id)
      .all()
    
    // Auto-seed if missing
    if (list.results.length === 0) {
      await seedVaccinations(c.env.DB, baby.id, baby.date_of_birth)
      list = await c.env.DB.prepare('SELECT * FROM vaccinations WHERE baby_id = ? ORDER BY due_date ASC')
        .bind(baby.id)
        .all()
    }
    
    return c.json(list.results)
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Database error' }, 500)
  }
})

app.post('/vaccinations', async (c) => {
  const { babyId, name, dueDate, status } = await c.req.json()
  const id = crypto.randomUUID()
  
  await c.env.DB.prepare(
    'INSERT INTO vaccinations (id, baby_id, vaccine_name, due_date, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, babyId, name, dueDate, status || 'pending').run()
  
  return c.json({ id, status: 'added' })
})

app.put('/vaccinations/:vaccineId', async (c) => {
  const vaccineId = c.req.param('vaccineId')
  const { status, administeredDate } = await c.req.json()
  
  await c.env.DB.prepare(
    'UPDATE vaccinations SET status = ?, administered_date = ? WHERE id = ?'
  ).bind(status, administeredDate, vaccineId).run()
  
  return c.json({ status: 'updated' })
})

/**
 * Milestones
 */
app.get('/milestones/:userId', async (c) => {
  const userId = c.req.param('userId')
  try {
    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) return c.json([])

    let list = await c.env.DB.prepare('SELECT * FROM milestones WHERE baby_id = ? ORDER BY created_at DESC')
      .bind(baby.id)
      .all()
    
    if (list.results.length === 0) {
      await seedMilestones(c.env.DB, baby.id)
      list = await c.env.DB.prepare('SELECT * FROM milestones WHERE baby_id = ? ORDER BY created_at DESC')
        .bind(baby.id)
        .all()
    }
    
    return c.json(list.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

app.put('/milestones/:milestoneId', async (c) => {
  const milestoneId = c.req.param('milestoneId')
  const { status, achievedDate } = await c.req.json()
  
  await c.env.DB.prepare(
    'UPDATE milestones SET status = ?, achieved_date = ? WHERE id = ?'
  ).bind(status, achievedDate, milestoneId).run()
  
  return c.json({ status: 'updated' })
})

app.post('/milestones', async (c) => {
  const { babyId, name, ageRange, badge, description, status } = await c.req.json()
  const id = crypto.randomUUID()
  
  await c.env.DB.prepare(
    'INSERT INTO milestones (id, baby_id, milestone_name, age_range, badge, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, babyId, name, ageRange, badge, description, status || 'pending').run()
  
  return c.json({ id, status: 'added' })
})

app.delete('/vaccinations/:vaccineId', async (c) => {
  const vaccineId = c.req.param('vaccineId')
  await c.env.DB.prepare('DELETE FROM vaccinations WHERE id = ?').bind(vaccineId).run()
  return c.json({ status: 'deleted' })
})

/**
 * OpsBoard Integration
 */
app.route('/ops', opsRoutes)

export default app
