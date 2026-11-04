import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { sessions } from '@/db/schema'
import { hashPassword } from '@/features/auth/password'
import { loadSession } from '@/features/auth/session'
import { resetStaffSignInLimiter, staffSignIn } from '@/features/auth/staffSignIn'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { sendPasswordReset } from '@/features/users/credentials'
import { completeStaffLink } from '@/features/users/links'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { lastToken, staffWith } from '@/test/staffUsers'

const signal = new AbortController().signal
const OLD_PASSWORD = 'the old staff password'
const EMAIL = 'racer@alderpond.example'
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDefaultGrants(handle.db, signal)
  resetStaffSignInLimiter()
})
afterAll(async () => {
  await handle.drop()
})

function resettingBeforeSessionInsert(db: Db, reset: () => Promise<unknown>): Db {
  let fired = false
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'insert') return Reflect.get(target, property, receiver) as unknown
      return (table: unknown) => {
        if (table !== sessions || fired) return target.insert(table as typeof sessions)
        fired = true
        return {
          values: (row: typeof sessions.$inferInsert) => ({
            returning: async () => {
              await reset()
              return await target.insert(sessions).values(row).returning()
            },
          }),
        }
      }
    },
  })
}

describe('a password reset that lands during a sign-in', () => {
  it('leaves no session signed in with the old password', async () => {
    const admin = await staffWith(handle.db, ['admin'])
    const mail = createMemoryTransport()
    const target = await makeUser(handle.db, {
      email: EMAIL,
      role: 'staff',
      passwordHash: await hashPassword(OLD_PASSWORD, signal),
    })
    await sendPasswordReset({ db: handle.db, actor: admin, signal, mail }, target)
    const token = lastToken(mail)
    const racing = resettingBeforeSessionInsert(handle.db, () =>
      completeStaffLink(handle.db, { token, password: 'the brand new password' }, signal),
    )
    const signedIn = await staffSignIn(racing, { email: EMAIL, password: OLD_PASSWORD }, signal)
    if (signedIn.ok) {
      expect((await loadSession(handle.db, signedIn.value.sid, signal)).ok).toBe(false)
    } else {
      expect(signedIn.error).toBe('invalid_credentials')
    }
  })
})
