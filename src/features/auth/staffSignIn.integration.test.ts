import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { auditLog } from '@/db/schema'
import { hashPassword } from '@/features/auth/password'
import { loadSession } from '@/features/auth/session'
import { resetStaffSignInLimiter, staffSignIn } from '@/features/auth/staffSignIn'
import { currentTotpCode, generateTotpSecret } from '@/features/auth/totp'
import { encryptSecret } from '@/server/secrets'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

let handle: TestDb
const signal = new AbortController().signal
const PASSWORD = 'a-long-staff-password'
const generic = { ok: false, error: 'invalid_credentials' }

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  resetStaffSignInLimiter()
})

async function staffUser(opts: { email: string; totp?: string; isActive?: boolean }) {
  return await makeUser(handle.db, {
    email: opts.email,
    role: 'staff',
    isActive: opts.isActive ?? true,
    passwordHash: await hashPassword(PASSWORD, signal),
    totpSecretEnc: opts.totp === undefined ? null : encryptSecret(opts.totp),
    totpEnabled: opts.totp !== undefined,
  })
}

describe('staffSignIn', () => {
  it('signs in with the right password and writes an audit entry', async () => {
    const userId = await staffUser({ email: 'ok@alderpond.example' })
    const result = await staffSignIn(
      handle.db,
      { email: 'ok@alderpond.example', password: PASSWORD },
      signal,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const live = await loadSession(handle.db, result.value.sid, signal)
    expect(live.ok && live.value.userId).toBe(userId)
    const audit = await handle.db.select().from(auditLog).where(eq(auditLog.actorUserId, userId))
    expect(audit.map((a) => a.action)).toContain('auth.staff_sign_in')
  })

  it('matches the email case-insensitively', async () => {
    await staffUser({ email: 'mixed@alderpond.example' })
    const result = await staffSignIn(
      handle.db,
      { email: 'MIXED@alderpond.example', password: PASSWORD },
      signal,
    )
    expect(result.ok).toBe(true)
  })

  it('gives the same generic error for wrong password, unknown email, public and deactivated users', async () => {
    await staffUser({ email: 'wrong@alderpond.example' })
    await staffUser({ email: 'off@alderpond.example', isActive: false })
    await makeUser(handle.db, {
      email: 'pub@alderpond.example',
      role: 'applicant',
      passwordHash: await hashPassword(PASSWORD, signal),
    })
    const attempts = [
      { email: 'wrong@alderpond.example', password: 'nope' },
      { email: 'ghost@alderpond.example', password: PASSWORD },
      { email: 'off@alderpond.example', password: PASSWORD },
      { email: 'pub@alderpond.example', password: PASSWORD },
    ]
    for (const attempt of attempts) {
      expect(await staffSignIn(handle.db, attempt, signal)).toEqual(generic)
    }
  })

  it('requires a code for an enrolled user and rejects a wrong code generically', async () => {
    const secret = generateTotpSecret()
    await staffUser({ email: 'totp@alderpond.example', totp: secret })
    const base = { email: 'totp@alderpond.example', password: PASSWORD }
    expect(await staffSignIn(handle.db, base, signal)).toEqual({
      ok: false,
      error: 'totp_required',
    })
    expect(await staffSignIn(handle.db, { ...base, totp: '000000' }, signal)).toEqual(generic)
    const good = await staffSignIn(
      handle.db,
      { ...base, totp: currentTotpCode(secret, Date.now()) },
      signal,
    )
    expect(good.ok).toBe(true)
  })

  it('does not reveal totp enrollment to a caller with a wrong password', async () => {
    await staffUser({ email: 'quiet@alderpond.example', totp: generateTotpSecret() })
    const result = await staffSignIn(
      handle.db,
      { email: 'quiet@alderpond.example', password: 'nope' },
      signal,
    )
    expect(result).toEqual(generic)
  })

  it('rate limits after 6 failures in 10 minutes for one email', async () => {
    await staffUser({ email: 'brute@alderpond.example' })
    const bad = { email: 'brute@alderpond.example', password: 'nope' }
    for (let i = 0; i < 6; i += 1) {
      expect(await staffSignIn(handle.db, bad, signal)).toEqual(generic)
    }
    expect(await staffSignIn(handle.db, bad, signal)).toEqual({ ok: false, error: 'rate_limited' })
    const right = { email: 'brute@alderpond.example', password: PASSWORD }
    expect(await staffSignIn(handle.db, right, signal)).toEqual({
      ok: false,
      error: 'rate_limited',
    })
  })
})
