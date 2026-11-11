import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword } from '@/features/auth/password'
import { resetStaffSignInLimiter, staffSignIn } from '@/features/auth/staffSignIn'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

let handle: TestDb
const signal = new AbortController().signal
const PASSWORD = 'a-long-staff-password'
const generic = { ok: false, error: 'invalid_credentials' }
const limited = { ok: false, error: 'rate_limited' }

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  resetStaffSignInLimiter()
})

async function staffUser(email: string) {
  return await makeUser(handle.db, {
    email,
    role: 'staff',
    passwordHash: await hashPassword(PASSWORD, signal),
  })
}

function attempt(clientKey: string, email: string, password: string) {
  return staffSignIn(handle.db, { clientKey, email, password }, signal)
}

describe('staffSignIn limits', () => {
  it('lets the real staff member sign in after another client locked out that email', async () => {
    await staffUser('target@alderpond.example')
    for (let i = 0; i < 6; i += 1) {
      expect(await attempt('attacker', 'target@alderpond.example', 'nope')).toEqual(generic)
    }
    expect(await attempt('attacker', 'target@alderpond.example', PASSWORD)).toEqual(limited)
    expect((await attempt('owner', 'target@alderpond.example', PASSWORD)).ok).toBe(true)
  })

  it('stops one client spraying many distinct emails after 20 attempts', async () => {
    for (let i = 0; i < 20; i += 1) {
      expect(await attempt('sprayer', `ghost${i}@alderpond.example`, 'nope')).toEqual(generic)
    }
    expect(await attempt('sprayer', 'ghost20@alderpond.example', 'nope')).toEqual(limited)
    expect(await attempt('bystander', 'ghost20@alderpond.example', 'nope')).toEqual(generic)
  })

  it('does not clear the per-client count on a successful sign-in', async () => {
    await staffUser('mine@alderpond.example')
    for (let i = 0; i < 19; i += 1) await attempt('busy', `ghost${i}@alderpond.example`, 'nope')
    expect((await attempt('busy', 'mine@alderpond.example', PASSWORD)).ok).toBe(true)
    expect(await attempt('busy', 'ghost99@alderpond.example', 'nope')).toEqual(limited)
  })
})
