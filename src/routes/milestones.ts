import { Hono } from 'hono'
import { seedMilestones } from '../utils/helpers'

type Bindings = { DB: D1Database }

const milestones = new Hono<{ Bindings: Bindings }>()

/**
 * GET /milestones/:userId
 */
milestones.get('/:userId', async (c) => {
  const userId = c.req.param('userId')

  try {
    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) return c.json([])

    let list = await c.env.DB.prepare(
      'SELECT * FROM milestones WHERE baby_id = ? ORDER BY created_at DESC'
    ).bind(baby.id).all()

    // Auto-seed if missing
    if (list.results.length === 0) {
      await seedMilestones(c.env.DB, baby.id)
      list = await c.env.DB.prepare(
        'SELECT * FROM milestones WHERE baby_id = ? ORDER BY created_at DESC'
      ).bind(baby.id).all()
    }

    return c.json(list.results)
  } catch (err) {
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * POST /milestones  — add a custom milestone
 */
milestones.post('/', async (c) => {
  const { babyId, name, ageRange, badge, description, status } = await c.req.json()
  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    'INSERT INTO milestones (id, baby_id, milestone_name, age_range, badge, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'))'
  ).bind(id, babyId, name, ageRange, badge, description, status || 'pending').run()

  return c.json({ id, status: 'added' })
})

/**
 * PUT /milestones/:milestoneId  — mark achieved
 */
milestones.put('/:milestoneId', async (c) => {
  const milestoneId = c.req.param('milestoneId')
  const { status, achievedDate } = await c.req.json()

  await c.env.DB.prepare(
    'UPDATE milestones SET status = ?, achieved_date = ? WHERE id = ?'
  ).bind(status, achievedDate, milestoneId).run()

  return c.json({ status: 'updated' })
})

export default milestones
