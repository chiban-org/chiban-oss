import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import type { Role } from '@/constants/roles'
import { auditLog, userRoles, users } from '@/db/schema'
import { userErrorCopy } from '@/features/users/errorCopy'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { makeInvitedUser } from '@/test/adminUsers'
import { makeUser } from '@/test/factories'
import {
  actionHarness,
  describeActionCases,
  isPublicRole,
  redirectsTo,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const actions = await import('./actions')

const h = actionHarness()

const forbidden = (role: Role) =>
  isPublicRole(role)
    ? STAFF_REFUSALS.signedOut
    : ({ ok: false, error: userErrorCopy('forbidden') } as const)

const REFUSALS = { ...STAFF_REFUSALS, forbidden }

function idRefusal() {
  return refuseField('userId', 'Choose a person.')
}

let emails = 0
function freshEmail() {
  emails += 1
  return `new.clerk${emails}@alderpond.example`
}

describeActionCases(h, 'inviteStaffAction', {
  invoke: actions.inviteStaffAction,
  actor: () => h.actorFor('admin'),
  input: () => ({
    displayName: '  Nell Newcomb ',
    email: ` ${freshEmail().toUpperCase()} `,
    roles: ['staff', 'finance'],
  }),
  fields: { displayName: text({ required: true, max: 120 }) },
  capability: 'user.manage',
  refusals: {
    ...REFUSALS,
    invalid: (v) =>
      refuseField(
        'displayName',
        v.kind === 'too_long' ? 'Enter a name of 120 characters or fewer.' : 'Enter a name.',
      ),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    const [made] = await db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.displayName, 'Nell Newcomb'))
    expect(result).toEqual(redirectsTo(`/staff/admin/users/${made?.id}?notice=invited`))
    expect(made?.email).toBe(String(input.email).trim().toLowerCase())
    expect(written).toEqual(
      expect.arrayContaining(['audit_log', 'staff_account_links', 'user_roles', 'users']),
    )
    expect(h.mail.sent).toHaveLength(1)
  },
})

describe('inviteStaffAction with the findings from the forms sweep', () => {
  it('refuses a 5000 character unbroken name beside the Name field and creates nobody', async () => {
    h.signIn(await h.actorFor('admin'))
    const name = `FS-A ${'x'.repeat(4995)}`
    const { value, written } = await h.recordWrites(() =>
      actions.inviteStaffAction(
        h.form({ displayName: name, email: freshEmail(), roles: ['staff'] }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('displayName', 'Enter a name of 120 characters or fewer.'),
      written: [],
    })
  })

  it('refuses an email that is not an address beside the Email field', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await actions.inviteStaffAction(
      h.form({ displayName: 'Nell', email: 'nell-at-town', roles: ['staff'] }),
    )
    expect(result).toEqual(refuseField('email', 'Enter an email address like name@example.com.'))
  })

  it('refuses no role beside the Roles group', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await actions.inviteStaffAction(
      h.form({ displayName: 'Nell', email: freshEmail() }),
    )
    expect(result).toEqual(refuseField('roles', 'Choose at least one staff role.'))
  })

  it('refuses a taken email beside the Email field', async () => {
    const admin = await h.actorFor('admin')
    h.signIn(admin)
    const [row] = await h.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, admin.userId))
    const result = await actions.inviteStaffAction(
      h.form({ displayName: 'Nell', email: String(row?.email).toUpperCase(), roles: ['staff'] }),
    )
    expect(result).toEqual(refuseField('email', 'That email address already has an account.'))
  })
})

const ID_FIELD = { userId: uuid({ required: true }) }

function idCases(
  name: string,
  action: (form: FormData) => Promise<unknown>,
  target: () => Promise<string>,
  message: string,
  extra: { audit: string; mailed?: number },
) {
  describeActionCases(h, name, {
    invoke: action as (form: FormData) => Promise<never>,
    actor: () => h.actorFor('admin'),
    input: async () => ({ userId: await target() }),
    fields: ID_FIELD,
    capability: 'user.manage',
    refusals: {
      ...REFUSALS,
      invalid: idRefusal(),
      checkOnly: CHECK_PASSED,
    },
    accepted: async (result, { db, written }) => {
      expect(result).toEqual({ ok: true, message })
      expect(written).toContain('audit_log')
      const audits = await db.select({ action: auditLog.action }).from(auditLog)
      expect(audits.map((a) => a.action)).toContain(extra.audit)
      expect(h.mail.sent).toHaveLength(extra.mailed ?? 0)
    },
  })
}

idCases(
  'resendInviteAction',
  actions.resendInviteAction,
  () => makeInvitedUser(h.db),
  'A new invite link was sent. The old link no longer works.',
  { audit: 'user.invite.resend', mailed: 1 },
)
idCases(
  'revokeInviteAction',
  actions.revokeInviteAction,
  () => makeInvitedUser(h.db),
  'Invite revoked. The account is disabled.',
  { audit: 'user.invite.revoke' },
)
idCases(
  'sendResetAction',
  actions.sendResetAction,
  () => makeUser(h.db, { role: 'staff' }),
  'Password reset link sent. It works once and expires in 24 hours.',
  { audit: 'user.password_reset.send', mailed: 1 },
)
idCases(
  'resetAuthenticatorAction',
  actions.resetAuthenticatorAction,
  () => makeUser(h.db, { role: 'staff', totpEnabled: true, totpSecretEnc: 'enc' }),
  'Authenticator cleared. They can set up a new one from Account.',
  { audit: 'user.totp.reset' },
)
idCases(
  'enableAction',
  actions.enableAction,
  () => makeUser(h.db, { role: 'staff', isActive: false }),
  'Account re-enabled. This person can sign in again.',
  { audit: 'user.enable' },
)

describeActionCases(h, 'disableAction', {
  invoke: actions.disableAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    userId: await makeUser(h.db, { role: 'staff' }),
    reason: ' Left the town ',
  }),
  fields: { userId: uuid({ required: true }), reason: text({ required: true, max: 500 }) },
  capability: 'user.manage',
  refusals: {
    ...REFUSALS,
    invalid: (v) =>
      v.field === 'userId'
        ? idRefusal()
        : refuseField(
            'reason',
            v.kind === 'too_long'
              ? 'Enter the reason for disabling this account of 500 characters or fewer.'
              : 'Enter the reason for disabling this account.',
          ),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Account disabled. This person is signed out everywhere.',
    })
    const [row] = await db
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, String(input.userId)))
    expect(row?.isActive).toBe(false)
  },
})

describe('disableAction with the findings from the forms sweep', () => {
  it('answers a check-only request with the reason refusal so the confirm never opens', async () => {
    h.signIn(await h.actorFor('admin'))
    const form = h.form({ userId: await makeUser(h.db, { role: 'staff' }), reason: '   ' })
    form.set(CHECK_ONLY_FIELD, '1')
    const { value, written } = await h.recordWrites(() => actions.disableAction(form))
    expect({ value, written }).toEqual({
      value: refuseField('reason', 'Enter the reason for disabling this account.'),
      written: [],
    })
  })
})

describeActionCases(h, 'setRolesAction', {
  invoke: actions.setRolesAction,
  actor: () => h.actorFor('admin'),
  input: async () => ({
    userId: await makeUser(h.db, { role: 'staff' }),
    roles: ['staff', 'inspector'],
  }),
  fields: ID_FIELD,
  capability: 'user.manage',
  refusals: { ...REFUSALS, invalid: idRefusal(), checkOnly: CHECK_PASSED },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Roles saved. They apply on the next page this person opens.',
    })
    const rows = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, String(input.userId)))
    expect(rows.map((r) => r.role).sort()).toEqual(['inspector', 'staff'])
  },
})

describe('setRolesAction refusals owned by a field', () => {
  it('refuses no role beside the Roles group', async () => {
    h.signIn(await h.actorFor('admin'))
    const result = await actions.setRolesAction(
      h.form({ userId: await makeUser(h.db, { role: 'staff' }) }),
    )
    expect(result).toEqual(refuseField('roles', 'Choose at least one staff role.'))
  })
})
