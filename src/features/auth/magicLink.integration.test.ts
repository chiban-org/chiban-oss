import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { magicLinks, userRoles, users } from '@/db/schema'
import { createStaffUser } from '@/features/auth/createStaffUser'
import {
  consumeMagicLink,
  requestMagicLink,
  resetMagicLinkLimiter,
} from '@/features/auth/magicLink'
import { loadSession } from '@/features/auth/session'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { err } from '@/types/result'

let handle: TestDb
let mail: MemoryMailTransport
const signal = new AbortController().signal

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

function tokenFromMail(): string {
  const text = mail.sent.at(-1)?.text ?? ''
  const match = /token=([A-Za-z0-9_-]+)/.exec(text)
  return match?.[1] ?? ''
}

async function requestFor(email: string): Promise<string> {
  const result = await requestMagicLink(handle.db, mail, email, signal)
  expect(result.ok).toBe(true)
  return tokenFromMail()
}

async function userIdOf(email: string): Promise<string> {
  const [user] = await handle.db.select().from(users).where(eq(users.email, email))
  return user?.id ?? ''
}

function linksFor(email: string) {
  return handle.db.select().from(magicLinks).where(eq(magicLinks.email, email))
}

describe('requestMagicLink', () => {
  it('mails one link and creates no user until the link is used', async () => {
    const token = await requestFor('First@alderpond.example')
    expect(token.length).toBeGreaterThanOrEqual(43)
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]?.to).toBe('first@alderpond.example')
    expect(await userIdOf('first@alderpond.example')).toBe('')
    const consumed = await consumeMagicLink(handle.db, token, signal)
    expect(consumed.ok).toBe(true)
    const [user] = await handle.db
      .select()
      .from(users)
      .where(eq(users.email, 'first@alderpond.example'))
    expect(user?.kind).toBe('public')
    const roles = await handle.db
      .select()
      .from(userRoles)
      .where(eq(userRoles.userId, user?.id ?? ''))
    expect(roles.map((r) => r.role)).toEqual(['applicant'])
  })

  it('requesting a link for an unused address creates no users row, and staff create for it succeeds afterwards', async () => {
    await requestFor('reserved@alderpond.example')
    expect(await userIdOf('reserved@alderpond.example')).toBe('')
    const created = await createStaffUser(
      handle.db,
      {
        email: 'reserved@alderpond.example',
        displayName: 'Reserved Clerk',
        role: 'staff',
        password: 'a-long-staff-password',
      },
      signal,
    )
    expect(created.ok).toBe(true)
  })

  it('a link requested before the address became a staff account no longer signs in', async () => {
    const token = await requestFor('late-staff@alderpond.example')
    await makeUser(handle.db, { email: 'late-staff@alderpond.example', role: 'staff' })
    expect(await consumeMagicLink(handle.db, token, signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('two links consumed at once for a new address create one user', async () => {
    const first = await requestFor('twin@alderpond.example')
    resetMagicLinkLimiter()
    const second = await requestFor('twin@alderpond.example')
    const results = await Promise.all([
      consumeMagicLink(handle.db, first, signal),
      consumeMagicLink(handle.db, second, signal),
    ])
    expect(results.every((r) => r.ok)).toBe(true)
    const rows = await handle.db
      .select()
      .from(users)
      .where(eq(users.email, 'twin@alderpond.example'))
    expect(rows).toHaveLength(1)
  })

  it('reports success and sends nothing for a staff email', async () => {
    await makeUser(handle.db, { email: 'clerk@alderpond.example', role: 'staff' })
    const before = await handle.db.select().from(magicLinks)
    const result = await requestMagicLink(handle.db, mail, 'clerk@alderpond.example', signal)
    expect(result).toEqual({ ok: true, value: undefined })
    expect(mail.sent).toHaveLength(0)
    expect(await handle.db.select().from(magicLinks)).toHaveLength(before.length)
  })

  it('reports success and sends nothing for a deactivated public user', async () => {
    await makeUser(handle.db, {
      email: 'gone@alderpond.example',
      role: 'applicant',
      isActive: false,
    })
    const result = await requestMagicLink(handle.db, mail, 'gone@alderpond.example', signal)
    expect(result.ok).toBe(true)
    expect(mail.sent).toHaveLength(0)
  })

  it('stores only the token hash', async () => {
    const token = await requestFor('hash@alderpond.example')
    const rows = await handle.db.select().from(magicLinks)
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('rate limits repeated requests for one email', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await requestMagicLink(handle.db, mail, 'spam@alderpond.example', signal)).ok).toBe(
        true,
      )
    }
    expect(await requestMagicLink(handle.db, mail, 'spam@alderpond.example', signal)).toEqual({
      ok: false,
      error: 'rate_limited',
    })
  })
})

describe('consumeMagicLink', () => {
  it('signs in once and then rejects reuse with the same generic error', async () => {
    const token = await requestFor('once@alderpond.example')
    const first = await consumeMagicLink(handle.db, token, signal)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const live = await loadSession(handle.db, first.value.sid, signal)
    expect(live.ok && live.value.userId).toBe(first.value.userId)
    expect(await consumeMagicLink(handle.db, token, signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('rejects an expired token', async () => {
    const token = await requestFor('late@alderpond.example')
    await handle.db
      .update(magicLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(magicLinks.email, 'late@alderpond.example'))
    expect(await consumeMagicLink(handle.db, token, signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('rejects an unknown token', async () => {
    expect(await consumeMagicLink(handle.db, 'x'.repeat(43), signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('rejects a token after the user is deactivated', async () => {
    await makeUser(handle.db, { email: 'off@alderpond.example', role: 'applicant' })
    const token = await requestFor('off@alderpond.example')
    await handle.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.email, 'off@alderpond.example'))
    expect(await consumeMagicLink(handle.db, token, signal)).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('expires links after 15 minutes', async () => {
    await requestFor('window@alderpond.example')
    const [row] = await linksFor('window@alderpond.example')
    const minutes = ((row?.expiresAt.getTime() ?? 0) - (row?.createdAt.getTime() ?? 0)) / 60_000
    expect(Math.round(minutes)).toBe(15)
  })
})

describe('next path', () => {
  it('a safe next path is returned when the link is consumed', async () => {
    const email = 'next.user@alderpond.example'
    await requestMagicLink(handle.db, mail, email, signal, '/claim/abc')
    const consumed = await consumeMagicLink(handle.db, tokenFromMail(), signal)
    expect(consumed.ok && consumed.value.nextPath).toBe('/claim/abc')
  })

  it('an unsafe next path is dropped', async () => {
    const email = 'unsafe.next@alderpond.example'
    await requestMagicLink(handle.db, mail, email, signal, '//evil.example')
    const consumed = await consumeMagicLink(handle.db, tokenFromMail(), signal)
    expect(consumed.ok && consumed.value.nextPath).toBeNull()
  })
})

describe('a failed sign-in email', () => {
  it('is logged with an error id and still reports success to the requester', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const email = 'mailfail@example.com'
    await makeUser(handle.db, { email, role: 'applicant' })
    const failing: MemoryMailTransport = {
      sent: [],
      send: () => Promise.resolve(err('send_failed' as const)),
    }
    const result = await requestMagicLink(handle.db, failing, email, signal)
    expect(result).toEqual({ ok: true, value: undefined })
    expect(spy.mock.calls.flat().join(' ')).toContain('E_MAIL_001')
    expect(spy.mock.calls.flat().join(' ')).not.toContain(email)
    spy.mockRestore()
  })
})
