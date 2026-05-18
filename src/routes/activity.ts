import { Hono } from 'hono'

type Bindings = { DB: D1Database }

const activity = new Hono<{ Bindings: Bindings }>()

/**
 * GET /logs/activity/:userId  — today's activity logs
 */
activity.get('/:userId', async (c) => {
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

/**
 * POST /logs/activity  — log a feeding / diaper / sleep event
 */
activity.post('/', async (c) => {
  const { babyId, type, detail, start, end, notes } = await c.req.json()
  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    'INSERT INTO activity_logs (id, baby_id, activity_type, detail, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, babyId, type, detail, start, end, notes).run()

  return c.json({ id, status: 'logged' })
})

export default activity
