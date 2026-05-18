import { Hono }  from 'hono'
import { cors }   from 'hono/cors'

// ─── Route modules ────────────────────────────────────────────────────────────
import auth         from './routes/auth'
import baby         from './routes/baby'
import chat         from './routes/chat'
import dashboard    from './routes/dashboard'
import activity     from './routes/activity'
import growth       from './routes/growth'
import vaccinations from './routes/vaccinations'
import milestones   from './routes/milestones'
import journal      from './routes/journal'
import diet from './routes/diet_plan'

// ─── Types ────────────────────────────────────────────────────────────────────
type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID?: string
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: Bindings }>()

// Allowed origins — add any new deployment URLs here
const ALLOWED_ORIGINS = [
  'http://localhost:5173',   // Vite dev server
  'http://localhost:5174',   // Vite dev server
  'http://localhost:5175',   // Vite dev server
  'http://localhost:8787',   // Vite dev server
  'http://localhost:3000',   // Alt local dev
  'http://localhost:8000',   // Alt local dev
  'https://mumaa-api.srisumit96-1ca.workers.dev', // Production worker
]

// Global CORS
// NOTE: `origin: '*'` + `credentials: true` is forbidden by the CORS spec.
// Use an explicit origin allowlist instead.
app.use('*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Staff-ID'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  // credentials: true is only needed for cookie-based auth.
  // This API uses Authorization headers, so it is intentionally omitted.
}))

// Health check
app.get('/', (c) => c.json({ message: 'Welcome to Mumaa AI API', status: 'online' }))

// ─── Mount Routers ────────────────────────────────────────────────────────────
app.route('/auth',         auth)
app.route('/baby',         baby)
app.route('/chat',         chat)
app.route('/dashboard',    dashboard)
app.route('/logs/activity',activity)
app.route('/growth',       growth)
app.route('/vaccinations', vaccinations)
app.route('/milestones',   milestones)
app.route('/journal',      journal)
app.route('/journal',      diet)


/**
 * Routines
 */
app.get('/routines/:userId', async (c) => {
  const userId = c.req.param('userId')
  try {
    const record = await c.env.DB.prepare('SELECT * FROM user_routines WHERE user_id = ?')
      .bind(userId)
      .first<{ custom_routines: string, completed_tasks: string }>()

    if (!record) {
      return c.json({ customRoutines: [], completedTasks: {} })
    }

    return c.json({
      customRoutines: JSON.parse(record.custom_routines || '[]'),
      completedTasks: JSON.parse(record.completed_tasks || '{}')
    })
  } catch (err) {
    console.error('GET /routines error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

app.post('/routines', async (c) => {
  try {
    const { userId, customRoutines, completedTasks } = await c.req.json()
    
    if (!userId) return c.json({ error: 'Missing userId' }, 400)

    const existing = await c.env.DB.prepare('SELECT user_id FROM user_routines WHERE user_id = ?')
      .bind(userId)
      .first()

    if (existing) {
      await c.env.DB.prepare(
        'UPDATE user_routines SET custom_routines = ?, completed_tasks = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
      ).bind(JSON.stringify(customRoutines || []), JSON.stringify(completedTasks || {}), userId).run()
    } else {
      await c.env.DB.prepare(
        'INSERT INTO user_routines (user_id, custom_routines, completed_tasks) VALUES (?, ?, ?)'
      ).bind(userId, JSON.stringify(customRoutines || []), JSON.stringify(completedTasks || {})).run()
    }

    return c.json({ status: 'saved' })
  } catch (err) {
    console.error('POST /routines error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * Diets
 */
app.get('/diet/:userId', async (c) => {
  const userId = c.req.param('userId')
  try {
    const record = await c.env.DB.prepare('SELECT * FROM user_diets WHERE user_id = ?')
      .bind(userId)
      .first<{ target: string, diet_type: string, content: string }>()

    if (!record) {
      return c.json({ error: 'No diet plan found' }, 404)
    }

    return c.json({
      target: record.target,
      dietType: record.diet_type,
      content: record.content
    })
  } catch (err) {
    console.error('GET /diet error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

app.post('/diet', async (c) => {
  try {
    const { userId, target, dietType } = await c.req.json()
    
    if (!userId) return c.json({ error: 'Missing userId' }, 400)

    // Simulate AI generation for now (in a real app, this calls OpenAI or similar)
    const content = `Here is your custom **${dietType}** nutrition plan for **${target === 'baby' ? 'Baby' : 'Mom'}**.\n\n• Morning: Nutrient-rich breakfast.\n• Afternoon: Balanced, energy-boosting lunch.\n• Evening: Light, digestive-friendly dinner.\n\nRemember to stay hydrated!`;

    const existing = await c.env.DB.prepare('SELECT user_id FROM user_diets WHERE user_id = ?')
      .bind(userId)
      .first()

    if (existing) {
      await c.env.DB.prepare(
        'UPDATE user_diets SET target = ?, diet_type = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
      ).bind(target, dietType, content, userId).run()
    } else {
      await c.env.DB.prepare(
        'INSERT INTO user_diets (user_id, target, diet_type, content) VALUES (?, ?, ?, ?)'
      ).bind(userId, target, dietType, content).run()
    }

    return c.json({ target, dietType, content })
  } catch (err) {
    console.error('POST /diet error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

export default app
