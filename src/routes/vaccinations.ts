import { Hono } from 'hono'
import { seedVaccinations } from '../utils/helpers'

type Bindings = { DB: D1Database }

const vaccinations = new Hono<{ Bindings: Bindings }>()

/**
 * GET /vaccinations/:userId
 */
vaccinations.get('/:userId', async (c) => {
  const userId = c.req.param('userId')

  try {
    const baby = await c.env.DB.prepare(
      'SELECT id, date_of_birth FROM babies WHERE user_id = ?'
    ).bind(userId).first<{ id: string; date_of_birth: string }>()

    if (!baby) return c.json([])

    let list = await c.env.DB.prepare(
      'SELECT * FROM vaccinations WHERE baby_id = ? ORDER BY due_date ASC'
    ).bind(baby.id).all()

    // Auto-seed if missing
    if (list.results.length === 0) {
      await seedVaccinations(c.env.DB, baby.id, baby.date_of_birth)
      list = await c.env.DB.prepare(
        'SELECT * FROM vaccinations WHERE baby_id = ? ORDER BY due_date ASC'
      ).bind(baby.id).all()
    }

    return c.json(list.results)
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * POST /vaccinations  — add a custom vaccination
 */
vaccinations.post('/', async (c) => {
  const { babyId, name, dueDate, status } = await c.req.json()
  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    'INSERT INTO vaccinations (id, baby_id, vaccine_name, due_date, status) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, babyId, name, dueDate, status || 'pending').run()

  return c.json({ id, status: 'added' })
})

/**
 * PUT /vaccinations/:vaccineId  — mark administered
 */
vaccinations.put('/:vaccineId', async (c) => {
  const vaccineId = c.req.param('vaccineId')
  const { status, administeredDate } = await c.req.json()

  await c.env.DB.prepare(
    'UPDATE vaccinations SET status = ?, administered_date = ? WHERE id = ?'
  ).bind(status, administeredDate, vaccineId).run()

  return c.json({ status: 'updated' })
})

/**
 * DELETE /vaccinations/:vaccineId
 */
vaccinations.delete('/:vaccineId', async (c) => {
  const vaccineId = c.req.param('vaccineId')
  await c.env.DB.prepare('DELETE FROM vaccinations WHERE id = ?').bind(vaccineId).run()
  return c.json({ status: 'deleted' })
})

export default vaccinations
