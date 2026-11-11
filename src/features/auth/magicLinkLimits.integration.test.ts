import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { requestMagicLink, resetMagicLinkLimiter } from '@/features/auth/magicLink'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
let mail: MemoryMailTransport
const signal = new AbortController().signal
const LIMITED = { ok: false, error: 'rate_limited' }

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  mail = createMemoryTransport()
  resetMagicLinkLimiter()
})

function request(email: string, client: string) {
  return requestMagicLink(handle.db, mail, { email, clientKey: client }, signal)
}

describe('requestMagicLink limits', () => {
  it('rate limits repeated requests for one email', async () => {
    for (let i = 0; i < 5; i += 1)
      expect((await request('spam@alderpond.example', 'c1')).ok).toBe(true)
    expect(await request('spam@alderpond.example', 'c1')).toEqual(LIMITED)
  })

  it('keeps the per-email budget across clients without blocking other addresses', async () => {
    for (let i = 0; i < 5; i += 1) await request('shared@alderpond.example', 'c1')
    expect(await request('shared@alderpond.example', 'c2')).toEqual(LIMITED)
    expect((await request('someone-else@alderpond.example', 'c2')).ok).toBe(true)
  })

  it('stops one client that sprays many distinct addresses after 10 requests', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await request(`spray${i}@alderpond.example`, 'c1')).ok).toBe(true)
    }
    expect(await request('spray10@alderpond.example', 'c1')).toEqual(LIMITED)
    expect(mail.sent).toHaveLength(10)
    expect((await request('spray0@alderpond.example', 'c2')).ok).toBe(true)
  })
})
