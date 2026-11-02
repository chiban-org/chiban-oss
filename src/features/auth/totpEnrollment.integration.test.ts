import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '@/db/schema'
import { currentTotpCode } from '@/features/auth/totp'
import { beginTotpEnrollment, confirmTotpEnrollment } from '@/features/auth/totpEnrollment'
import { decryptSecret } from '@/server/secrets'
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

async function row(userId: string) {
  const [r] = await handle.db.select().from(users).where(eq(users.id, userId))
  return r
}

describe('totp enrollment', () => {
  it('stores the secret encrypted and enables only after a correct code', async () => {
    const userId = await makeUser(handle.db, { email: 'enroll@alderpond.example' })
    const begun = await beginTotpEnrollment(handle.db, userId, signal)
    expect(begun.ok).toBe(true)
    const pending = await row(userId)
    expect(pending?.totpEnabled).toBe(false)
    expect(pending?.totpSecretEnc?.startsWith('v1:')).toBe(true)

    expect(await confirmTotpEnrollment(handle.db, userId, '000000', signal)).toEqual({
      ok: false,
      error: 'invalid_code',
    })
    expect((await row(userId))?.totpEnabled).toBe(false)

    const plain = decryptSecret(pending?.totpSecretEnc ?? '')
    if (!plain.ok) throw new Error('decrypt')
    const confirmed = await confirmTotpEnrollment(
      handle.db,
      userId,
      currentTotpCode(plain.value, Date.now()),
      signal,
    )
    expect(confirmed.ok).toBe(true)
    expect((await row(userId))?.totpEnabled).toBe(true)
  })

  it('refuses to restart enrollment once enabled', async () => {
    const userId = await makeUser(handle.db, { email: 'done@alderpond.example', totpEnabled: true })
    expect(await beginTotpEnrollment(handle.db, userId, signal)).toEqual({
      ok: false,
      error: 'already_enrolled',
    })
  })
})
