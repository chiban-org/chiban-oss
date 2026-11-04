import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { userRoles, users } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { createSession, loadSession } from '@/features/auth/session'
import { staffSignIn } from '@/features/auth/staffSignIn'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { resetAuthenticator, sendPasswordReset } from '@/features/users/credentials'
import { inviteStaff } from '@/features/users/invite'
import { completeStaffLink } from '@/features/users/links'
import { disableStaff, enableStaff, setStaffRoles } from '@/features/users/manage'
import { loadUserDetail } from '@/features/users/userDetail'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { grant, lastToken, staffWith } from '@/test/staffUsers'

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

const ctxOf = (actor: Actor) => ({ db: handle.db, actor, signal, mail })
const refused = (error: string) => ({ ok: false, error })

async function rolesOf(userId: string): Promise<string[]> {
  const rows = await handle.db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  return rows.map((r) => r.role).sort()
}

describe('managing staff accounts', () => {
  it('refuses every change from a viewer without user.manage', async () => {
    const clerk = await staffWith(handle.db, ['staff'])
    const target = await makeUser(handle.db, { role: 'inspector', totpEnabled: true })
    const ctx = ctxOf(clerk)
    expect(await setStaffRoles(ctx, target, ['staff'])).toEqual(refused('forbidden'))
    expect(await disableStaff(ctx, target, 'Left the town')).toEqual(refused('forbidden'))
    expect(await enableStaff(ctx, target)).toEqual(refused('forbidden'))
    expect(await resetAuthenticator(ctx, target)).toEqual(refused('forbidden'))
    expect(await sendPasswordReset(ctx, target)).toEqual(refused('forbidden'))
    expect(await loadUserDetail(handle.db, clerk, target, signal)).toBeNull()
    expect(await rolesOf(target)).toEqual(['inspector'])
  })

  it('changes roles and records who changed them', async () => {
    const target = await makeUser(handle.db, { role: 'inspector' })
    expect((await setStaffRoles(ctxOf(admin), target, ['staff', 'finance'])).ok).toBe(true)
    expect(await rolesOf(target)).toEqual(['finance', 'staff'])
    const detail = await loadUserDetail(handle.db, admin, target, signal)
    expect(detail?.history[0]?.text).toBe('Roles changed from Inspector to Land use staff, Finance')
    expect(await setStaffRoles(ctxOf(admin), target, [])).toEqual(refused('invalid_roles'))
    expect(await setStaffRoles(ctxOf(admin), target, ['applicant'])).toEqual(
      refused('invalid_roles'),
    )
  })

  it('refuses to disable yourself or to disable without a reason', async () => {
    const target = await makeUser(handle.db, { role: 'staff' })
    expect(await disableStaff(ctxOf(admin), admin.userId, 'Leaving')).toEqual(refused('self'))
    expect(await disableStaff(ctxOf(admin), target, '   ')).toEqual(refused('reason_required'))
  })

  it('keeps at least one active administrator', async () => {
    expect(await setStaffRoles(ctxOf(admin), admin.userId, ['staff'])).toEqual(
      refused('last_admin'),
    )
    await inviteStaff(ctxOf(admin), {
      displayName: 'Pending Admin',
      email: 'pending.admin@alderpond.example',
      roles: ['admin'],
    })
    expect(await setStaffRoles(ctxOf(admin), admin.userId, ['staff'])).toEqual(
      refused('last_admin'),
    )
    await grant(handle.db, 'records_custodian', 'user.manage')
    const custodian = await staffWith(handle.db, ['records_custodian'])
    expect(await disableStaff(ctxOf(custodian), admin.userId, 'Retired')).toEqual(
      refused('last_admin'),
    )
    const second = await staffWith(handle.db, ['admin'])
    expect((await disableStaff(ctxOf(custodian), admin.userId, 'Retired')).ok).toBe(true)
    expect(await setStaffRoles(ctxOf(second), second.userId, ['staff'])).toEqual(
      refused('last_admin'),
    )
  })

  it('never removes the last administrator under concurrent changes', async () => {
    await grant(handle.db, 'records_custodian', 'user.manage')
    const custodian = await staffWith(handle.db, ['records_custodian'])
    const second = await makeUser(handle.db, { role: 'admin' })
    const third = await makeUser(handle.db, { role: 'admin' })
    const targets = [admin.userId, second, third]
    const calls = Array.from({ length: 12 }, (_, i) => {
      const userId = targets[i % targets.length] ?? ''
      return i % 2 === 0
        ? setStaffRoles(ctxOf(custodian), userId, ['staff'])
        : disableStaff(ctxOf(custodian), userId, 'Concurrent change')
    })
    await Promise.all(calls)
    const live = await Promise.all(
      targets.map((id) => loadUserDetail(handle.db, custodian, id, signal)),
    )
    expect(live.filter((d) => d?.status === 'active' && d.roles.includes('admin'))).toHaveLength(1)
  })

  it('ends a disabled account’s session at once and restores sign-in on re-enable', async () => {
    const target = await makeUser(handle.db, { role: 'inspector' })
    const session = await createSession(handle.db, target, signal)
    if (!session.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'no session')
    expect((await loadSession(handle.db, session.value.sid, signal)).ok).toBe(true)
    expect((await disableStaff(ctxOf(admin), target, 'Left the town')).ok).toBe(true)
    expect((await loadSession(handle.db, session.value.sid, signal)).ok).toBe(false)
    expect(await loadActor(handle.db, target, signal)).toBeNull()
    const detail = await loadUserDetail(handle.db, admin, target, signal)
    expect(detail).toMatchObject({ status: 'disabled', disabledReason: 'Left the town' })
    expect(await disableStaff(ctxOf(admin), target, 'Again')).toEqual(refused('already_disabled'))
    expect((await enableStaff(ctxOf(admin), target)).ok).toBe(true)
    expect(await loadActor(handle.db, target, signal)).not.toBeNull()
    expect((await loadSession(handle.db, session.value.sid, signal)).ok).toBe(false)
    expect(await enableStaff(ctxOf(admin), target)).toEqual(refused('not_disabled'))
  })

  it('clears the authenticator so the person enrols again', async () => {
    const target = await makeUser(handle.db, {
      role: 'staff',
      totpEnabled: true,
      totpSecretEnc: 'enc',
    })
    expect((await resetAuthenticator(ctxOf(admin), target)).ok).toBe(true)
    const [row] = await handle.db.select().from(users).where(eq(users.id, target))
    expect(row).toMatchObject({ totpEnabled: false, totpSecretEnc: null, totpLastCounter: null })
    expect(await resetAuthenticator(ctxOf(admin), target)).toEqual(refused('no_authenticator'))
  })

  it('sends a reset link that sets a password without signing the person in', async () => {
    const target = await makeUser(handle.db, {
      role: 'staff',
      email: 'reset.me@alderpond.example',
    })
    const session = await createSession(handle.db, target, signal)
    if (!session.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'no session')
    expect((await sendPasswordReset(ctxOf(admin), target)).ok).toBe(true)
    expect(mail.sent[0]?.to).toBe('reset.me@alderpond.example')
    const done = await completeStaffLink(
      handle.db,
      { token: lastToken(mail), password: PASSWORD },
      signal,
    )
    expect(done.ok && done.value.sid === null && done.value.purpose === 'password_reset').toBe(true)
    expect((await loadSession(handle.db, session.value.sid, signal)).ok).toBe(false)
    const signedIn = await staffSignIn(
      handle.db,
      { email: 'reset.me@alderpond.example', password: PASSWORD },
      signal,
    )
    expect(signedIn.ok).toBe(true)
  })

  it('offers a reset link only to active accounts', async () => {
    const disabled = await makeUser(handle.db, { role: 'staff', isActive: false })
    expect(await sendPasswordReset(ctxOf(admin), disabled)).toEqual(refused('not_active'))
    expect(await sendPasswordReset(ctxOf(admin), 'not-a-uuid')).toEqual(refused('not_found'))
    const applicant = await makeUser(handle.db, { role: 'applicant' })
    expect(await sendPasswordReset(ctxOf(admin), applicant)).toEqual(refused('not_found'))
  })
})
