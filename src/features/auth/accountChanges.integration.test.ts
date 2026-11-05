import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, users } from '@/db/schema'
import {
  changeDisplayName,
  changeOwnPassword,
  resetPasswordChangeLimiter,
} from '@/features/auth/accountChanges'
import { hashPassword, verifyPassword } from '@/features/auth/password'
import { createSession, loadSession } from '@/features/auth/session'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

let handle: TestDb
const signal = new AbortController().signal
const OLD = 'old password 12345'
const NEW = 'new password 67890'

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  resetPasswordChangeLimiter()
})

async function userWithPassword(): Promise<string> {
  return await makeUser(handle.db, { passwordHash: await hashPassword(OLD, signal) })
}

async function row(userId: string) {
  const [r] = await handle.db.select().from(users).where(eq(users.id, userId))
  return r
}

describe('changing your own name', () => {
  it('trims and stores the name and writes an audit row', async () => {
    const userId = await userWithPassword()
    expect(await changeDisplayName(handle.db, userId, '  Rae Records  ', signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect((await row(userId))?.displayName).toBe('Rae Records')
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, userId))
    expect(audits.map((a) => a.action)).toContain('user.name.change')
  })

  it('refuses an empty name and keeps the old one', async () => {
    const userId = await userWithPassword()
    const before = (await row(userId))?.displayName
    expect(await changeDisplayName(handle.db, userId, '   ', signal)).toEqual({
      ok: false,
      error: 'invalid_name',
    })
    expect((await row(userId))?.displayName).toBe(before)
  })
})

describe('changing your own password', () => {
  it('needs the current password and keeps the old hash when it is wrong', async () => {
    const userId = await userWithPassword()
    const before = (await row(userId))?.passwordHash
    const result = await changeOwnPassword(
      handle.db,
      { userId, current: 'wrong password 1', next: NEW, keepSid: null },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'wrong_password' })
    expect((await row(userId))?.passwordHash).toBe(before)
  })

  it('refuses a short new password', async () => {
    const userId = await userWithPassword()
    const result = await changeOwnPassword(
      handle.db,
      { userId, current: OLD, next: 'short', keepSid: null },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'weak_password' })
  })

  it('refuses a new password equal to the current one', async () => {
    const userId = await userWithPassword()
    const result = await changeOwnPassword(
      handle.db,
      { userId, current: OLD, next: OLD, keepSid: null },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'unchanged' })
  })

  it('changes the password, keeps this session and ends the others', async () => {
    const userId = await userWithPassword()
    const here = await createSession(handle.db, userId, signal)
    const elsewhere = await createSession(handle.db, userId, signal)
    if (!here.ok || !elsewhere.ok) throw new Error('no session')
    const result = await changeOwnPassword(
      handle.db,
      { userId, current: OLD, next: NEW, keepSid: here.value.sid },
      signal,
    )
    expect(result).toEqual({ ok: true, value: undefined })
    const stored = (await row(userId))?.passwordHash ?? ''
    expect(await verifyPassword(NEW, stored, signal)).toBe(true)
    expect(await verifyPassword(OLD, stored, signal)).toBe(false)
    expect((await loadSession(handle.db, here.value.sid, signal)).ok).toBe(true)
    expect((await loadSession(handle.db, elsewhere.value.sid, signal)).ok).toBe(false)
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, userId))
    expect(audits.map((a) => a.action)).toContain('user.password.change')
  })

  it('stops after repeated wrong current passwords', async () => {
    const userId = await userWithPassword()
    for (let i = 0; i < 5; i += 1) {
      await changeOwnPassword(
        handle.db,
        { userId, current: 'wrong password 1', next: NEW, keepSid: null },
        signal,
      )
    }
    const result = await changeOwnPassword(
      handle.db,
      { userId, current: OLD, next: NEW, keepSid: null },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'rate_limited' })
  })

  it('refuses an account that has no password', async () => {
    const userId = await makeUser(handle.db)
    const result = await changeOwnPassword(
      handle.db,
      { userId, current: OLD, next: NEW, keepSid: null },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'wrong_password' })
  })
})
