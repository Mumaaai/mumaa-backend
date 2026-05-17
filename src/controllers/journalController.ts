/**
 * Journal Controller
 * Pure business logic — no HTTP primitives here.
 * All functions accept a D1Database and typed params; they return data or throw.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: string
  baby_id: string
  title: string
  description: string | null
  media_url: string | null
  recorded_date: string
  created_at: string
  type: 'text' | 'voice_transcript'
  audio_data: string | null
}

export interface CreateJournalParams {
  userId: string
  title?: string
  description?: string
  mediaUrl?: string
  recordedDate?: string
  type?: 'text' | 'voice_transcript'
  audioData?: string
}

export interface UpdateJournalParams {
  title?: string
  description?: string
  mediaUrl?: string
  recordedDate?: string
  audioData?: string
}

// ─── Helper: resolve baby from userId ────────────────────────────────────────

async function getBabyId(db: D1Database, userId: string): Promise<string | null> {
  const baby = await db
    .prepare('SELECT id FROM babies WHERE user_id = ?')
    .bind(userId)
    .first<{ id: string }>()
  return baby?.id ?? null
}

// ─── Controller methods ───────────────────────────────────────────────────────

/**
 * Fetch all memories for a user's baby, newest first.
 */
export async function getMemories(
  db: D1Database,
  userId: string
): Promise<JournalEntry[]> {
  const babyId = await getBabyId(db, userId)
  if (!babyId) return []

  const result = await db
    .prepare(`
      SELECT id, baby_id, title, description, media_url,
             recorded_date, created_at, type, audio_data
      FROM   memory_journal
      WHERE  baby_id = ?
      ORDER  BY created_at DESC
    `)
    .bind(babyId)
    .all<JournalEntry>()

  return result.results
}

/**
 * Create a new memory entry (text or voice_transcript).
 * Returns the new entry's id.
 */
export async function createMemory(
  db: D1Database,
  params: CreateJournalParams
): Promise<{ id: string } | { error: string; status: 400 | 404 }> {
  const { userId, title, description, mediaUrl, recordedDate, type, audioData } = params

  if (!userId) return { error: 'userId is required', status: 400 }

  const babyId = await getBabyId(db, userId)
  if (!babyId) return { error: 'Baby profile not found for this user', status: 404 }

  const id         = crypto.randomUUID()
  const entryType  = type        || 'text'
  const entryTitle = title       || (entryType === 'voice_transcript' ? 'Voice Memory' : 'Text Memory')
  const entryDate  = recordedDate || new Date().toISOString().split('T')[0]
  const entryMediaUrl = mediaUrl || audioData || null

  await db
    .prepare(`
      INSERT INTO memory_journal
        (id, baby_id, title, description, media_url, recorded_date, type, audio_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      id,
      babyId,
      entryTitle,
      description ?? null,
      entryMediaUrl,
      entryDate,
      entryType,
      audioData   ?? null
    )
    .run()

  return { id }
}

/**
 * Partially update a memory entry.
 * Only fields explicitly provided are overwritten (COALESCE pattern).
 */
export async function updateMemory(
  db: D1Database,
  memoryId: string,
  params: UpdateJournalParams
): Promise<void> {
  const { title, description, mediaUrl, recordedDate, audioData } = params
  const entryMediaUrl = mediaUrl || audioData || null

  await db
    .prepare(`
      UPDATE memory_journal
      SET
        title         = COALESCE(?, title),
        description   = COALESCE(?, description),
        media_url     = COALESCE(?, media_url),
        recorded_date = COALESCE(?, recorded_date),
        audio_data    = COALESCE(?, audio_data)
      WHERE id = ?
    `)
    .bind(
      title        ?? null,
      description  ?? null,
      entryMediaUrl?? null,
      recordedDate ?? null,
      audioData    ?? null,
      memoryId
    )
    .run()
}

/**
 * Delete a single memory by its id.
 */
export async function deleteMemory(
  db: D1Database,
  memoryId: string
): Promise<void> {
  await db
    .prepare('DELETE FROM memory_journal WHERE id = ?')
    .bind(memoryId)
    .run()
}

/**
 * Delete every memory belonging to a user's baby.
 */
export async function clearMemories(
  db: D1Database,
  userId: string
): Promise<{ cleared: boolean }> {
  const babyId = await getBabyId(db, userId)
  if (!babyId) return { cleared: false }

  await db
    .prepare('DELETE FROM memory_journal WHERE baby_id = ?')
    .bind(babyId)
    .run()

  return { cleared: true }
}
