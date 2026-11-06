import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { users } from '@/db/schema'
import { hashPassword } from '@/features/auth/password'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { makeUser } from '@/test/factories'
import { actorOf } from '@/test/staffUsers'
import {
  actionHarness,
  describeActionCases,
  redirectsTo,
  STAFF_REFUSALS,
  text,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('@/app/(staff)/staff/account/actions')
const { resetPasswordChangeLimiter } = await import('@/features/auth/accountChanges')

const signal = new AbortController().signal
const OLD = 'old password 12345'
const NEW = 'new password 67890'
const h = actionHarness()

beforeEach(() => {
  resetPasswordChangeLimiter()
})

async function staffWithPassword() {
  const userId = await makeUser(h.db, { passwordHash: await hashPassword(OLD, signal) })
  return await actorOf(h.db, userId)
}

const PUBLIC_ROLES = ['applicant', 'contractor'] as const
const REFUSALS = { ...STAFF_REFUSALS, checkOnly: CHECK_PASSED }

describeActionCases(h, 'changeNameAction', {
  invoke: actions.changeNameAction,
  actor: staffWithPassword,
  input: () => ({ displayName: '  Rae Records  ' }),
  fields: { displayName: text({ required: true, max: 120 }) },
  refusedRoles: PUBLIC_ROLES,
  refusals: {
    ...REFUSALS,
    invalid: (v) =>
      refuseField(
        'displayName',
        v.kind === 'too_long' ? 'Enter your name of 120 characters or fewer.' : 'Enter your name.',
      ),
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Name saved.' })
    expect(written).toEqual(['audit_log', 'users'])
    const rows = await db.select({ name: users.displayName }).from(users)
    expect(rows.map((r) => r.name)).toContain('Rae Records')
  },
})

describe('changeNameAction acts on the signed-in person only', () => {
  it('leaves everyone else untouched', async () => {
    h.signIn(await staffWithPassword())
    const other = await makeUser(h.db)
    const [before] = await h.db.select().from(users).where(eq(users.id, other))
    await actions.changeNameAction(h.form({ displayName: 'Rae Records' }))
    const [theirs] = await h.db.select().from(users).where(eq(users.id, other))
    expect(theirs?.displayName).toBe(before?.displayName)
  })
})

describeActionCases(h, 'changePasswordAction', {
  invoke: actions.changePasswordAction,
  actor: staffWithPassword,
  input: () => ({ current: OLD, password: NEW, confirm: NEW }),
  fields: {},
  refusedRoles: PUBLIC_ROLES,
  refusals: { ...REFUSALS, invalid: refuseField('current', 'Enter your current password.') },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Password changed. Other devices were signed out.',
    })
    expect(written).toEqual(expect.arrayContaining(['audit_log', 'users']))
  },
})

describe('changePasswordAction refusals beside their fields', () => {
  async function change(fields: Record<string, string>) {
    h.signIn(await staffWithPassword())
    return await h.recordWrites(() =>
      actions.changePasswordAction(
        h.form({ current: OLD, password: NEW, confirm: NEW, ...fields }),
      ),
    )
  }

  it('names the current password when it is wrong', async () => {
    const { value } = await change({ current: 'nope nope nope 1' })
    expect(value).toEqual(refuseField('current', 'The current password is not right.'))
  })

  it('names the confirmation when the two new passwords differ', async () => {
    const { value, written } = await change({ confirm: `${NEW}x` })
    expect({ value, written }).toEqual({
      value: refuseField('confirm', 'The two new passwords do not match.'),
      written: [],
    })
  })

  it('names the new password when it is too short', async () => {
    const { value } = await change({ password: 'short', confirm: 'short' })
    expect(value).toEqual(refuseField('password', 'Use at least 12 characters.'))
  })

  it('names the new password when it equals the current one', async () => {
    const { value } = await change({ password: OLD, confirm: OLD })
    expect(value).toEqual(
      refuseField('password', 'Choose a password different from the current one.'),
    )
  })

  it('keeps passwords with spaces and emoji exactly as typed', async () => {
    const spaced = '  pass phrase \u{1F511} 2026  '
    const { value } = await change({ password: spaced, confirm: spaced })
    expect(value).toMatchObject({ ok: true })
  })

  it('refuses more wrong attempts once the limit is reached', async () => {
    h.signIn(await staffWithPassword())
    for (let i = 0; i < 5; i++) {
      await actions.changePasswordAction(
        h.form({ current: 'wrong wrong wrong', password: NEW, confirm: NEW }),
      )
    }
    const limited = await actions.changePasswordAction(
      h.form({ current: OLD, password: NEW, confirm: NEW }),
    )
    expect(limited).toEqual({
      ok: false,
      error: 'Too many wrong attempts. Wait ten minutes and try again.',
    })
  })
})

describeActionCases(h, 'confirmTotpAction', {
  invoke: actions.confirmTotpAction,
  actor: staffWithPassword,
  input: () => ({ code: '000000' }),
  fields: {},
  refusedRoles: PUBLIC_ROLES,
  refusals: { ...REFUSALS, invalid: refuseField('code', 'Enter the 6-digit code.') },
  accepted: (result) => {
    expect(result).toEqual(refuseField('code', 'That code did not match. Try the next one.'))
  },
})

describe('confirmTotpAction refusals beside the code field', () => {
  it.each(['12345', 'abcdef', '1234567', '   '])('refuses %j', async (code) => {
    h.signIn(await staffWithPassword())
    expect(await actions.confirmTotpAction(h.form({ code }))).toEqual(
      refuseField('code', 'Enter the 6-digit code.'),
    )
  })
})

describeActionCases(h, 'beginTotpAction', {
  invoke: actions.beginTotpAction,
  actor: staffWithPassword,
  input: () => ({}),
  fields: {},
  refusedRoles: PUBLIC_ROLES,
  refusals: REFUSALS,
  accepted: (result, { written }) => {
    expect(result).toEqual(redirectsTo('/staff/account/totp'))
    expect(written).toEqual(['users'])
  },
})
