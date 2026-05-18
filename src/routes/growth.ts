import { Hono } from 'hono'

type Bindings = { DB: D1Database }

const growth = new Hono<{ Bindings: Bindings }>()

/**
 * GET /growth/:userId
 */
growth.get('/:userId', async (c) => {
  const userId = c.req.param('userId')
  console.log(`GET /growth for user: ${userId}`)

  try {
    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) {
      console.warn(`No baby found for user ${userId}`)
      return c.json([])
    }

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

/**
 * POST /growth
 */
growth.post('/', async (c) => {
  try {
    const body = await c.req.json()
    console.log('POST /growth body:', body)
    const { userId, weight_kg, height_cm, recorded_at } = body

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

export default growth
