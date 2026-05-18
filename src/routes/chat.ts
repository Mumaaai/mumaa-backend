import { Hono } from 'hono'

type Bindings = { DB: D1Database }

const chat = new Hono<{ Bindings: Bindings }>()

/**
 * GET /chat/sessions/:userId
 */
chat.get('/sessions/:userId', async (c) => {
  const userId = c.req.param('userId')
  const sessions = await c.env.DB.prepare(
    'SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC'
  ).bind(userId).all()

  // Backwards compatibility: fall back to distinct session_ids from chat_messages
  if (sessions.results.length === 0) {
    const legacy = await c.env.DB.prepare(
      `SELECT DISTINCT session_id as id, MIN(created_at) as created_at
       FROM chat_messages WHERE user_id = ?
       GROUP BY session_id ORDER BY created_at DESC`
    ).bind(userId).all()
    return c.json(legacy.results)
  }

  return c.json(sessions.results)
})

/**
 * GET /chat/history/:sessionId
 */
chat.get('/history/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const messages = await c.env.DB.prepare(
    'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC'
  ).bind(sessionId).all()
  return c.json(messages.results)
})

/**
 * POST /chat/message
 */
chat.post('/message', async (c) => {
  const { userId, sessionId, role, content } = await c.req.json()
  const id = crypto.randomUUID()

  const session = await c.env.DB.prepare('SELECT id FROM chat_sessions WHERE id = ?')
    .bind(sessionId)
    .first()

  if (!session) {
    await c.env.DB.prepare(
      'INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)'
    ).bind(sessionId, userId, 'New Chat').run()
  } else {
    await c.env.DB.prepare(
      'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(sessionId).run()
  }

  await c.env.DB.prepare(
    'INSERT INTO chat_messages (id, user_id, session_id, role, content) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, sessionId, role, content).run()

  return c.json({ id, status: 'saved' })
})

/**
 * PUT /chat/session/:sessionId — rename session
 */
chat.put('/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const { title } = await c.req.json()

  await c.env.DB.prepare(
    'UPDATE chat_sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(title, sessionId).run()

  return c.json({ status: 'updated' })
})

export default chat
