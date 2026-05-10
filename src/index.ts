import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS
app.use('*', cors({
  origin: '*', // We can restrict this to the GitHub Pages URL later
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
 * Authentication with Google
 * Frontend sends the id_token after user signs in with Google
 */
app.post('/auth/google', async (c) => {
  const { id_token } = await c.req.json()
  
  if (!id_token) {
    return c.json({ error: 'Missing id_token' }, 400)
  }

  try {
    // 1. Verify the token with Google
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`)
    const payload: any = await response.json()

    if (!response.ok || payload.aud !== c.env.GOOGLE_CLIENT_ID) {
      return c.json({ error: 'Invalid token' }, 401)
    }

    // 2. Check if user exists in D1
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(payload.email)
      .first()

    let userId = user?.id

    if (!user) {
      // 3. Create user if they don't exist
      userId = crypto.randomUUID()
      await c.env.DB.prepare(
        'INSERT INTO users (id, email, full_name, hashed_password) VALUES (?, ?, ?, ?)'
      ).bind(userId, payload.email, payload.name, 'google_auth_placeholder').run()
    }

    // 4. Return user info (You might want to generate a session/JWT here)
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
    console.error('Auth error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

/**
 * Chat Endpoints
 */
app.get('/chat/history/:userId', async (c) => {
  const userId = c.req.param('userId')
  const messages = await c.env.DB.prepare(
    'SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC'
  ).bind(userId).all()
  
  return c.json(messages.results)
})

app.post('/chat/message', async (c) => {
  const { userId, role, content } = await c.req.json()
  const id = crypto.randomUUID()
  
  await c.env.DB.prepare(
    'INSERT INTO chat_messages (id, user_id, role, content) VALUES (?, ?, ?, ?)'
  ).bind(id, userId, role, content).run()
  
  return c.json({ id, status: 'saved' })
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
