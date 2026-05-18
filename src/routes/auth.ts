import { Hono } from 'hono'
import { hashPassword } from '../utils/helpers'

type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
}

const auth = new Hono<{ Bindings: Bindings }>()

/**
 * POST /auth/signup
 */
auth.post('/signup', async (c) => {
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
      user: { id: userId, email, name: fullName },
    })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * POST /auth/signin
 */
auth.post('/signin', async (c) => {
  const { email, password } = await c.req.json()

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400)
  }

  try {
    const hashedPassword = await hashPassword(password)
    const user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE email = ? AND hashed_password = ?'
    ).bind(email, hashedPassword).first()

    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401)
    }

    return c.json({
      message: 'Signed in successfully',
      user: { id: user.id, email: user.email, name: user.full_name },
    })
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * POST /auth/google
 */
auth.post('/google', async (c) => {
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
        picture: payload.picture,
      },
    })
  } catch (err) {
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

export default auth
