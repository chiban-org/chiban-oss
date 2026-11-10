import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { logoutCore } from '@/features/auth/logout'
import { createSession, loadSession } from '@/features/auth/session'
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
afterEach(() => {
  env.CHIBAN_DEMO_MODE = false
})

describe('logoutCore', () => {
  it('revokes every session of the user', async () => {
    const userId = await makeUser(handle.db)
    const a = await createSession(handle.db, userId, signal)
    const b = await createSession(handle.db, userId, signal)
    if (!a.ok || !b.ok) throw new Error('setup')
    const out = await logoutCore({ db: handle.db, sid: a.value.sid, signal })
    expect(out).toEqual({ ok: true, value: { userId } })
    expect((await loadSession(handle.db, a.value.sid, signal)).ok).toBe(false)
    expect((await loadSession(handle.db, b.value.sid, signal)).ok).toBe(false)
  })

  it('in demo mode signs out only this visitor, not others sharing the persona', async () => {
    env.CHIBAN_DEMO_MODE = true
    const userId = await makeUser(handle.db)
    const a = await createSession(handle.db, userId, signal)
    const b = await createSession(handle.db, userId, signal)
    if (!a.ok || !b.ok) throw new Error('setup')
    expect(await logoutCore({ db: handle.db, sid: a.value.sid, signal })).toEqual({
      ok: true,
      value: { userId },
    })
    expect((await loadSession(handle.db, a.value.sid, signal)).ok).toBe(false)
    expect((await loadSession(handle.db, b.value.sid, signal)).ok).toBe(true)
  })

  it('is idempotent without a session', async () => {
    expect(await logoutCore({ db: handle.db, sid: null, signal })).toEqual({
      ok: true,
      value: { userId: null },
    })
  })
})
