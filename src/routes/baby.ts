import { Hono } from 'hono'
import { seedVaccinations, seedMilestones } from '../utils/helpers'

type Bindings = { DB: D1Database }

const baby = new Hono<{ Bindings: Bindings }>()

/**
 * GET /baby/:userId
 */
baby.get('/:userId', async (c) => {
  const userId = c.req.param('userId')
  const babyProfile = await c.env.DB.prepare('SELECT * FROM babies WHERE user_id = ?')
    .bind(userId)
    .first()

  return c.json(babyProfile || { error: 'No baby profile found' })
})

/**
 * POST /baby  — create or update baby profile
 */
baby.post('/', async (c) => {
  const {
    userId, name, dob, gender, bloodGroup, language, aiDetail, momName,
    deliveryType, parentingType, medicalConditions, birthWeight, momCondition,
  } = await c.req.json()

  if (!userId || !name || !dob) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  try {
    const existing = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (existing) {
      await c.env.DB.prepare(
        `UPDATE babies SET
          name = ?, date_of_birth = ?, gender = ?, blood_group = ?,
          preferred_language = ?, ai_detail = ?, mom_name = ?,
          delivery_type = ?, parenting_type = ?, medical_conditions = ?,
          birth_weight = ?, mom_condition = ?
         WHERE user_id = ?`
      ).bind(
        name, dob, gender, bloodGroup, language, aiDetail, momName,
        deliveryType, parentingType, medicalConditions, birthWeight, momCondition,
        userId
      ).run()

      // Seed if needed
      const vaxCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM vaccinations WHERE baby_id = ?'
      ).bind(existing.id).first<{ count: number }>()
      if (vaxCount && vaxCount.count === 0) {
        await seedVaccinations(c.env.DB, existing.id, dob)
      }

      const milCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM milestones WHERE baby_id = ?'
      ).bind(existing.id).first<{ count: number }>()
      if (milCount && milCount.count === 0) {
        await seedMilestones(c.env.DB, existing.id)
      }

      return c.json({ message: 'Profile updated' })
    } else {
      const babyId = crypto.randomUUID()
      await c.env.DB.prepare(
        `INSERT INTO babies (
          id, user_id, name, date_of_birth, gender, blood_group,
          preferred_language, ai_detail, mom_name,
          delivery_type, parenting_type, medical_conditions,
          birth_weight, mom_condition
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        babyId, userId, name, dob, gender, bloodGroup,
        language, aiDetail, momName,
        deliveryType, parentingType, medicalConditions,
        birthWeight, momCondition
      ).run()

      await seedVaccinations(c.env.DB, babyId, dob)
      await seedMilestones(c.env.DB, babyId)

      return c.json({ message: 'Profile created', id: babyId })
    }
  } catch (err) {
    console.error(err)
    return c.json({ error: 'Database error' }, 500)
  }
})

export default baby
