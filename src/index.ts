import { Hono } from 'hono'
import { cors } from 'hono/cors'

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
  allowHeaders: ['Content-Type', 'Authorization'],
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
  const { userId, name, dob, gender, bloodGroup, language, aiDetail, momName } = await c.req.json()
  
  if (!userId || !name || !dob) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  try {
    const existingBaby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first()

    if (existingBaby) {
      await c.env.DB.prepare(
        'UPDATE babies SET name = ?, date_of_birth = ?, gender = ?, blood_group = ?, preferred_language = ?, ai_detail = ?, mom_name = ? WHERE user_id = ?'
      ).bind(name, dob, gender, bloodGroup, language, aiDetail, momName, userId).run()
      
      return c.json({ message: 'Profile updated' })
    } else {
      const babyId = crypto.randomUUID()
      await c.env.DB.prepare(
        'INSERT INTO babies (id, user_id, name, date_of_birth, gender, blood_group, preferred_language, ai_detail, mom_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(babyId, userId, name, dob, gender, bloodGroup, language, aiDetail, momName).run()
      
      return c.json({ message: 'Profile created', id: babyId })
    }
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

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
 * Activity Logs
 */
app.post('/logs/activity', async (c) => {
  const { babyId, type, detail, start, end, notes } = await c.req.json()
  const id = crypto.randomUUID()
  
  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, baby_id, activity_type, detail, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, babyId, type, detail, start, end, notes).run()
  
  return c.json({ id, status: 'logged' })
})

export default app
