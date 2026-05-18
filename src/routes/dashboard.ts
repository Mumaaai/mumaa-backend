import { Hono } from 'hono'

type Bindings = { DB: D1Database }

const dashboard = new Hono<{ Bindings: Bindings }>()

/**
 * GET /dashboard/:userId  — aggregated dashboard stats
 */
dashboard.get('/:userId', async (c) => {
  const userId = c.req.param('userId')

  try {
    const baby = await c.env.DB.prepare(
      'SELECT id, name, date_of_birth FROM babies WHERE user_id = ?'
    ).bind(userId).first<{ id: string; name: string; date_of_birth: string }>()

    if (!baby) return c.json({ error: 'No baby profile found' }, 404)

    const today = new Date().toISOString().split('T')[0]

    // Today's activity stats
    const stats = await c.env.DB.prepare(`
      SELECT
        activity_type,
        COUNT(*) as count,
        SUM(CASE WHEN activity_type = 'sleep' AND end_time IS NOT NULL
            THEN (strftime('%s', end_time) - strftime('%s', start_time)) ELSE 0 END) as total_seconds
      FROM activity_logs
      WHERE baby_id = ? AND date(start_time) = ?
      GROUP BY activity_type
    `).bind(baby.id, today).all()

    const todayStats = { feedings: 0, sleepHours: 0 }
    stats.results.forEach((r: any) => {
      if (r.activity_type === 'feeding') todayStats.feedings = Number(r.count)
      if (r.activity_type === 'sleep')
        todayStats.sleepHours = Math.round((Number(r.total_seconds) || 0) / 3600 * 10) / 10
    })

    // Recent activity
    const recentActivity = await c.env.DB.prepare(`
      SELECT * FROM activity_logs
      WHERE baby_id = ?
      ORDER BY start_time DESC
      LIMIT 10
    `).bind(baby.id).all()

    // Next vaccine
    const nextVaccine = await c.env.DB.prepare(`
      SELECT vaccine_name, due_date FROM vaccinations
      WHERE baby_id = ? AND status = 'pending' AND due_date >= ?
      ORDER BY due_date ASC
      LIMIT 1
    `).bind(baby.id, today).first()

    // Milestones achieved
    const milestonesCount = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM milestones
      WHERE baby_id = ? AND status = 'achieved'
    `).bind(baby.id).first<{ count: number }>()

    return c.json({
      babyName: baby.name,
      babyDob: baby.date_of_birth,
      todayStats,
      recentActivity: recentActivity.results,
      nextVaccine,
      milestonesAchieved: milestonesCount?.count || 0,
    })
  } catch (err) {
    console.error('Dashboard error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

export default dashboard
