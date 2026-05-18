import { Hono } from 'hono'

type Bindings = { DB: D1Database }

const diet = new Hono<{ Bindings: Bindings }>()

/**
 * POST /diet — Save a new diet plan
 */
diet.post('/', async (c) => {
  try {
    const { userId, target, dietType, content } = await c.req.json()
    
    if (!userId || !target || !dietType || !content) {
      return c.json({ error: 'Missing required fields' }, 400)
    }

    // Locate the baby attached to this user to correctly tie the relational context
    const baby = await c.env.DB.prepare(
      'SELECT id FROM babies WHERE user_id = ?'
    ).bind(userId).first<{ id: string }>()

    if (!baby) {
      return c.json({ error: 'Baby profile must be created before making a diet plan' }, 404)
    }

    const id = crypto.randomUUID()
    
    await c.env.DB.prepare(`
      INSERT INTO diet_plans (id, user_id, baby_id, target, diet_type, content) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, userId, baby.id, target, dietType, content).run()

    return c.json({ id, status: 'saved', content }, 201)
  } catch (err) {
    console.error('POST /diet error:', err)
    return c.json({ error: 'Database error while saving diet plan' }, 500)
  }
})

/**
 * GET /diet/:userId — Fetch all historical diet plans for a user
 */
diet.get('/:userId', async (c) => {
  const userId = c.req.param('userId')
  
  try {
    const records = await c.env.DB.prepare(`
      SELECT * FROM diet_plans 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).bind(userId).all()
    
    return c.json(records.results || [])
  } catch (err) {
    console.error('GET /diet error:', err)
    return c.json({ error: 'Database error while fetching diet plans' }, 500)
  }
})

export default diet