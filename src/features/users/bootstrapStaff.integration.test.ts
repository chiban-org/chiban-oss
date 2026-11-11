import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { userRoles, users } from '@/db/schema'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { bootstrapStaff } from '@/features/users/bootstrapStaff'
import { completeStaffLink, peekStaffLink } from '@/features/users/links'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const now = new Date('2026-11-11T12:00:00Z')
const input = { email: 'Clerk@AlderPond.example', displayName: 'Nell Newcomb', role: 'admin' }
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

function tokenOf(url: string): string {
  return new URL(url).searchParams.get('token') ?? ''
}

describe('bootstrapStaff', () => {
  it('creates an invited admin and a set-password link that completes', async () => {
    const created = await bootstrapStaff(handle.db, input, { now, signal })
    if (!created.ok) throw new Error(created.error)
    expect(created.value.emailSent).toBeNull()
    expect(created.value.setPasswordUrl).toContain('/staff/set-password?token=')
    const token = tokenOf(created.value.setPasswordUrl)
    const peek = await peekStaffLink(handle.db, token, signal, now)
    expect(peek).toMatchObject({
      state: 'valid',
      purpose: 'invite',
      email: 'clerk@alderpond.example',
    })
    const done = await completeStaffLink(
      handle.db,
      { token, password: 'correct horse battery', now },
      signal,
    )
    expect(done.ok).toBe(true)
    const [row] = await handle.db.select().from(users).where(eq(users.id, created.value.userId))
    expect(row?.passwordHash).not.toBeNull()
    const roles = await handle.db.select().from(userRoles)
    expect(roles.map((r) => r.role)).toEqual(['admin'])
  })

  it('does not store a password until the link is used', async () => {
    const created = await bootstrapStaff(handle.db, input, { now, signal })
    if (!created.ok) throw new Error(created.error)
    const [row] = await handle.db.select().from(users).where(eq(users.id, created.value.userId))
    expect(row?.passwordHash).toBeNull()
  })

  it('emails the same link when a transport is given', async () => {
    const mail = createMemoryTransport()
    const created = await bootstrapStaff(handle.db, input, { now, signal, mail })
    if (!created.ok) throw new Error(created.error)
    expect(created.value.emailSent).toBe(true)
    expect(mail.sent.at(-1)?.text).toContain(created.value.setPasswordUrl)
  })

  it('refuses a role that does not exist and creates nothing', async () => {
    expect(await bootstrapStaff(handle.db, { ...input, role: 'wizard' }, { now, signal })).toEqual({
      ok: false,
      error: 'invalid_role',
    })
    expect(await handle.db.select().from(users)).toEqual([])
  })

  it('refuses a resident role', async () => {
    const result = await bootstrapStaff(handle.db, { ...input, role: 'applicant' }, { now, signal })
    expect(result).toEqual({ ok: false, error: 'invalid_role' })
  })

  it('refuses a bad email', async () => {
    const result = await bootstrapStaff(handle.db, { ...input, email: 'nope' }, { now, signal })
    expect(result).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('refuses an email already in use', async () => {
    await bootstrapStaff(handle.db, input, { now, signal })
    const again = await bootstrapStaff(handle.db, input, { now, signal })
    expect(again).toEqual({ ok: false, error: 'email_taken' })
  })
})
