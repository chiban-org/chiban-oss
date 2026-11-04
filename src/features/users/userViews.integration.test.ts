import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { inviteStaff, revokeInvite } from '@/features/users/invite'
import { completeStaffLink } from '@/features/users/links'
import { disableStaff } from '@/features/users/manage'
import type { StaffStatus } from '@/features/users/staffAccounts'
import { loadUserDetail } from '@/features/users/userDetail'
import { loadUserList } from '@/features/users/userList'
import { USER_SORT } from '@/features/users/userListParams'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { lastToken, staffWith } from '@/test/staffUsers'

const signal = new AbortController().signal
const mail = createMemoryTransport()
let handle: TestDb
let admin: Actor
let passwordless = ''

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDefaultGrants(handle.db, signal)
  admin = await staffWith(handle.db, ['admin'])
  passwordless = await makeUser(handle.db, { roles: ['inspector', 'board_member'] })
  await makeUser(handle.db, { role: 'applicant' })
  await makeUser(handle.db, { role: 'board_member', kind: 'public' })
  const ctx = { db: handle.db, actor: admin, signal, mail }
  const invite = (email: string) =>
    inviteStaff(ctx, { displayName: email.split('@')[0] ?? email, email, roles: ['finance'] })
  await invite('pending@alderpond.example')
  const accepted = await invite('accepted@alderpond.example')
  await completeStaffLink(
    handle.db,
    { token: lastToken(mail), password: 'correct horse battery' },
    signal,
  )
  const revoked = await invite('revoked@alderpond.example')
  if (revoked.ok) await revokeInvite(ctx, revoked.value.userId)
  if (accepted.ok) await disableStaff(ctx, accepted.value.userId, 'Moved away')
})
afterAll(async () => {
  await handle.drop()
})

async function list(tab: StaffStatus) {
  return await loadUserList(
    handle.db,
    admin,
    { tab, sort: { key: USER_SORT.defaultKey, dir: 'asc' } },
    signal,
  )
}

describe('the staff user list', () => {
  it('splits staff accounts into active, invited and disabled with counts', async () => {
    const active = await list('active')
    expect(Object.fromEntries(active?.counts ?? [])).toEqual({ active: 2, invited: 1, disabled: 2 })
    expect(active?.rows.map((r) => r.email).sort()).toEqual(
      [
        (await loadUserDetail(handle.db, admin, admin.userId, signal))?.email,
        (await loadUserDetail(handle.db, admin, passwordless, signal))?.email,
      ].sort(),
    )
    expect((await list('invited'))?.rows.map((r) => r.email)).toEqual(['pending@alderpond.example'])
    expect((await list('disabled'))?.rows.map((r) => r.email).sort()).toEqual([
      'accepted@alderpond.example',
      'revoked@alderpond.example',
    ])
  })

  it('treats a staff account with no password and no invite as active', async () => {
    const detail = await loadUserDetail(handle.db, admin, passwordless, signal)
    expect(detail?.status).toBe('active')
    const row = (await list('active'))?.rows.find((r) => r.id === passwordless)
    expect(row?.roleLabels).toEqual(['Inspector', 'Board member'])
  })

  it('sorts by role rank', async () => {
    const sorted = await loadUserList(
      handle.db,
      admin,
      { tab: 'active', sort: { key: 'roles', dir: 'desc' } },
      signal,
    )
    expect(sorted?.rows.map((r) => r.id)).toEqual([passwordless, admin.userId])
  })

  it('shows nothing to a viewer without user.manage', async () => {
    const clerk = await staffWith(handle.db, ['staff'])
    expect(await list('active')).not.toBeNull()
    expect(
      await loadUserList(
        handle.db,
        clerk,
        { tab: 'active', sort: { key: 'name', dir: 'asc' } },
        signal,
      ),
    ).toBeNull()
  })

  it('explains a disabled account and its history', async () => {
    const revoked = (await list('disabled'))?.rows.find(
      (r) => r.email === 'revoked@alderpond.example',
    )
    const detail = await loadUserDetail(handle.db, admin, revoked?.id ?? '', signal)
    expect(detail?.disabledReason).toBe('Invite revoked')
    expect(detail?.history.map((h) => h.text)).toEqual(['Invite revoked', 'Invited as Finance'])
    expect(detail?.history[0]?.byName).toBe(
      (await loadUserDetail(handle.db, admin, admin.userId, signal))?.displayName,
    )
  })
})
