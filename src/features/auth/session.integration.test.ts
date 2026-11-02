import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sessions, users } from '@/db/schema'
import { createSession, loadSession, revokeSession } from '@/features/auth/session'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

let handle: TestDb
const signal = new AbortController().signal

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

async function newSession(): Promise<{ userId: string; sid: string; sessionId: string }> {
  const userId = await makeUser(handle.db)
  const created = await createSession(handle.db, userId, signal)
  if (!created.ok) throw new Error('session not created')
  return { userId, sid: created.value.sid, sessionId: created.value.sessionId }
}

describe('sessions', () => {
  it('loads a live session by its token', async () => {
    const { userId, sid } = await newSession()
    const loaded = await loadSession(handle.db, sid, signal)
    expect(loaded.ok && loaded.value.userId).toBe(userId)
  })

  it('stores only the token hash', async () => {
    const { sid, sessionId } = await newSession()
    const [row] = await handle.db.select().from(sessions).where(eq(sessions.id, sessionId))
    expect(row?.tokenHash).toBe(createHash('sha256').update(sid).digest('base64url'))
    expect(JSON.stringify(row)).not.toContain(sid)
  })

  it('returns not_found for a revoked session', async () => {
    const { sid } = await newSession()
    await revokeSession(handle.db, sid, signal)
    expect(await loadSession(handle.db, sid, signal)).toEqual({ ok: false, error: 'not_found' })
  })

  it('returns not_found for an expired session', async () => {
    const { sid, sessionId } = await newSession()
    await handle.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.id, sessionId))
    expect(await loadSession(handle.db, sid, signal)).toEqual({ ok: false, error: 'not_found' })
  })

  it('returns not_found when the user is deactivated', async () => {
    const { sid, userId } = await newSession()
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, userId))
    expect(await loadSession(handle.db, sid, signal)).toEqual({ ok: false, error: 'not_found' })
  })

  it('returns not_found for an unknown token', async () => {
    expect(await loadSession(handle.db, 'nope', signal)).toEqual({ ok: false, error: 'not_found' })
  })
})
