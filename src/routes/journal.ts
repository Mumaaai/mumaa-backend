import { Hono } from 'hono'

type Bindings = { DB: D1Database }

const journal = new Hono<{ Bindings: Bindings }>()

/**
 * GET /journal/:userId  — fetch all memories for a user's baby
 */
journal.get('/:userId', async (c) => {
  const userId = c.req.param('userId')

  try {
    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) return c.json([])

    const memories = await c.env.DB.prepare(`
      SELECT id, baby_id, title, description, media_url, recorded_date, created_at, type, audio_data
      FROM memory_journal
      WHERE baby_id = ?
      ORDER BY created_at DESC
    `).bind(baby.id).all()

    return c.json(memories.results)
  } catch (err) {
    console.error('GET /journal error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * POST /journal  — create a new memory (text or voice_transcript)
 * Body: { userId, title?, description?, type?, audioData?, recordedDate?, mediaUrl? }
 */

journal.post('/', async (c) => {
  try {
    const body = await c.req.json()
    const { userId, title, description, mediaUrl, recordedDate, type, audioData } = body

    if (!userId) {
      return c.json({ error: 'userId is required' }, 400)
    }

    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) {
      return c.json({ error: 'Baby profile not found for this user' }, 404)
    }

    const id          = crypto.randomUUID()
    const entryType   = type || 'text'
    const entryTitle  = title || (entryType === 'voice_transcript' ? 'Voice Memory' : 'Text Memory')
    const entryDate   = recordedDate || new Date().toISOString().split('T')[0]
    const entryMediaUrl = mediaUrl || audioData || null

    await c.env.DB.prepare(`
      INSERT INTO memory_journal (id, baby_id, title, description, media_url, recorded_date, type, audio_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      baby.id,
      entryTitle,
      description || null,
      entryMediaUrl,
      entryDate,
      entryType,
      audioData   || null
    ).run()

    return c.json({ id, status: 'saved' })
  } catch (err) {
    console.error('POST /journal error:', err)
    return c.json({ error: 'Database error or invalid JSON' }, 500)
  }
})

/**
 * PUT /journal/:memoryId  — update memory fields (partial update via COALESCE)
 * Body: { title?, description?, mediaUrl?, recordedDate?, audioData? }
 */
journal.put('/:memoryId', async (c) => {
  const memoryId = c.req.param('memoryId')

  try {
    const { title, description, mediaUrl, recordedDate, audioData } = await c.req.json()
    const entryMediaUrl = mediaUrl || audioData || null

    await c.env.DB.prepare(`
      UPDATE memory_journal
      SET
        title        = COALESCE(?, title),
        description  = COALESCE(?, description),
        media_url    = COALESCE(?, media_url),
        recorded_date= COALESCE(?, recorded_date),
        audio_data   = COALESCE(?, audio_data)
      WHERE id = ?
    `).bind(
      title        || null,
      description  || null,
      entryMediaUrl|| null,
      recordedDate || null,
      audioData    || null,
      memoryId
    ).run()

    return c.json({ status: 'updated' })
  } catch (err) {
    console.error('PUT /journal error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * DELETE /journal/all/:userId  — clear every memory for a user's baby
 * NOTE: must be defined BEFORE /:memoryId to avoid routing conflict
 */
journal.delete('/all/:userId', async (c) => {
  const userId = c.req.param('userId')

  try {
    const baby = await c.env.DB.prepare('SELECT id FROM babies WHERE user_id = ?')
      .bind(userId)
      .first<{ id: string }>()

    if (!baby) return c.json({ status: 'nothing to delete' })

    await c.env.DB.prepare('DELETE FROM memory_journal WHERE baby_id = ?').bind(baby.id).run()
    return c.json({ status: 'cleared' })
  } catch (err) {
    console.error('DELETE /journal/all error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

/**
 * DELETE /journal/:memoryId  — delete a single memory
 */
journal.delete('/:memoryId', async (c) => {
  const memoryId = c.req.param('memoryId')

  try {
    await c.env.DB.prepare('DELETE FROM memory_journal WHERE id = ?').bind(memoryId).run()
    return c.json({ status: 'deleted' })
  } catch (err) {
    console.error('DELETE /journal error:', err)
    return c.json({ error: 'Database error' }, 500)
  }
})

export default journal
