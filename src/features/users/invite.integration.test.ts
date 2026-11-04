import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { inviteStaff, resendInvite, revokeInvite } from '@/features/users/invite'
import { completeStaffLink, peekStaffLink } from '@/features/users/links'
import { loadUserDetail } from '@/features/users/userDetail'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { DAY_MS, lastToken, staffWith } from '@/test/staffUsers'

const signal = new AbortController().signal
const PASSWORD = 'correct horse battery'
let handle: TestDb
let admin: Actor
let mail: MemoryMailTransport

beforeEach(async () => {
  handle = await makeTestDb()
  await seedDefaultGrants(handle.db, signal)
  admin = await staffWith(handle.db, ['admin'])
  mail = createMemoryTransport()
})
afterEach(async () => {
  await handle.drop()
})

async function invite(email = 'new.clerk@alderpond.example', roles = ['staff', 'finance']) {
  const invited = await inviteStaff(ctxOf(admin), { displayName: 'Nell Newcomb', email, roles })
  if (!invited.ok) throw new AppError(ErrorIds.DB_INVARIANT, invited.error)
  return invited.value.userId
}

function ctxOf(actor: Actor) {
  return { db: handle.db, actor, signal, mail }
}

function complete(token: string, password = PASSWORD, now?: Date) {
  return completeStaffLink(
    handle.db,
    now === undefined ? { token, password } : { token, password, now },
    signal,
  )
}

async function statusOf(userId: string) {
  return (await loadUserDetail(handle.db, admin, userId, signal))?.status
}

describe('inviting staff', () => {
  it('refuses a viewer without user.manage', async () => {
    const clerk = await staffWith(handle.db, ['staff'])
    const input = { displayName: 'X', email: 'x@alderpond.example', roles: ['staff'] }
    expect(await inviteStaff(ctxOf(clerk), input)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const userId = await invite()
    expect(await resendInvite(ctxOf(clerk), userId)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await revokeInvite(ctxOf(clerk), userId)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(mail.sent).toHaveLength(1)
  })

  it('creates a staff account with no password and emails a single-use link', async () => {
    const userId = await invite('New.Clerk@AlderPond.example')
    const [row] = await handle.db.select().from(users).where(eq(users.id, userId))
    expect(row).toMatchObject({
      kind: 'staff',
      email: 'new.clerk@alderpond.example',
      passwordHash: null,
      isActive: true,
    })
    expect(await statusOf(userId)).toBe('invited')
    expect(mail.sent[0]?.to).toBe('new.clerk@alderpond.example')
    expect(mail.sent[0]?.text).toContain('7 days')
    const token = lastToken(mail)
    expect(await peekStaffLink(handle.db, token, signal)).toMatchObject({
      state: 'valid',
      purpose: 'invite',
      email: 'new.clerk@alderpond.example',
    })
    const done = await complete(token)
    expect(done.ok && done.value.purpose === 'invite' && done.value.sid !== null).toBe(true)
    expect(await statusOf(userId)).toBe('active')
    expect(await complete(token)).toEqual({
      ok: false,
      error: 'used',
    })
    expect((await peekStaffLink(handle.db, token, signal)).state).toBe('used')
  })

  it('needs at least one staff role and a free email address', async () => {
    const base = { displayName: 'Nell', email: 'nell@alderpond.example' }
    for (const roles of [[], ['applicant'], ['owner']]) {
      expect(await inviteStaff(ctxOf(admin), { ...base, roles })).toEqual({
        ok: false,
        error: 'invalid_roles',
      })
    }
    await makeUser(handle.db, { email: 'taken@alderpond.example', role: 'applicant' })
    const taken = { ...base, email: 'Taken@alderpond.example', roles: ['staff'] }
    expect(await inviteStaff(ctxOf(admin), taken)).toEqual({
      ok: false,
      error: 'email_taken',
    })
    expect(mail.sent).toHaveLength(0)
  })

  it('refuses a link that has expired', async () => {
    await invite()
    const token = lastToken(mail)
    const later = new Date(Date.now() + 7 * DAY_MS + 60_000)
    expect((await peekStaffLink(handle.db, token, signal, later)).state).toBe('expired')
    expect(await complete(token, PASSWORD, later)).toEqual({
      ok: false,
      error: 'expired',
    })
  })

  it('keeps the link usable after a password that is too short', async () => {
    await invite()
    const token = lastToken(mail)
    expect(await complete(token, 'short')).toEqual({
      ok: false,
      error: 'weak_password',
    })
    expect((await peekStaffLink(handle.db, token, signal)).state).toBe('valid')
  })

  it('replaces the link on resend', async () => {
    const userId = await invite()
    const first = lastToken(mail)
    expect((await resendInvite(ctxOf(admin), userId)).ok).toBe(true)
    const second = lastToken(mail)
    expect(second).not.toBe(first)
    expect(await complete(first)).toEqual({
      ok: false,
      error: 'revoked',
    })
    expect((await complete(second)).ok).toBe(true)
    expect(await resendInvite(ctxOf(admin), userId)).toEqual({
      ok: false,
      error: 'not_invited',
    })
  })

  it('disables the account when the invite is revoked', async () => {
    const userId = await invite()
    const token = lastToken(mail)
    expect(await revokeInvite(ctxOf(admin), userId)).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await statusOf(userId)).toBe('disabled')
    expect((await peekStaffLink(handle.db, token, signal)).state).toBe('revoked')
    expect(await complete(token)).toEqual({
      ok: false,
      error: 'revoked',
    })
    expect(await revokeInvite(ctxOf(admin), userId)).toEqual({
      ok: false,
      error: 'not_invited',
    })
  })

  it('treats an unknown token as invalid', async () => {
    expect((await peekStaffLink(handle.db, 'nope', signal)).state).toBe('invalid')
    expect(await complete('nope')).toEqual({
      ok: false,
      error: 'invalid',
    })
  })
})
