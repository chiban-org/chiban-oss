import { expect, it, vi } from 'vitest'
import { staffAccountLinks, users } from '@/db/schema'
import { issueLink } from '@/features/users/links'
import { makeUser } from '@/test/factories'
import { actionHarness, redirectsTo, settle, text } from '@/test/testHarness/actions'
import { describeAnonymousCases } from '@/test/testHarness/actions/anonymousCases'
import type { SetPasswordState } from './actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { setPasswordAction } = await import('./actions')

const h = actionHarness()
const PASSWORD = 'a-long-staff-password'
const SESSION = 'Your session expired. Reload the page and try again.'
const MISMATCH = 'The two passwords do not match.'
const DEAD_LINK =
  'This link is not valid. Check that you opened the whole link from the email, or ask your administrator for a new one.'

const setPassword = (form: FormData): Promise<SetPasswordState> =>
  setPasswordAction({ error: null }, form)

async function inviteToken(purpose: 'invite' | 'password_reset' = 'invite'): Promise<string> {
  const userId = await makeUser(h.db, { role: 'staff' })
  return await issueLink(h.db, { userId, purpose, createdBy: userId }, new Date())
}

describeAnonymousCases(h, 'setPasswordAction', {
  invoke: setPassword,
  input: async () => ({ token: await inviteToken(), password: PASSWORD, confirm: PASSWORD }),
  fields: {
    token: text({ required: true }),
    confirm: {
      required: true,
      variants: [
        {
          kind: 'not_a_choice',
          label: 'that differs from the password',
          value: 'different-password-1',
        },
      ],
    },
  },
  refusals: {
    csrf: { error: SESSION },
    checkOnly: { error: SESSION },
    invalid: (v) => ({ error: v.field === 'token' ? DEAD_LINK : MISMATCH }),
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual(redirectsTo('/staff'))
    expect(written).toEqual(expect.arrayContaining(['staff_account_links', 'users', 'sessions']))
    expect(
      (await db.select({ id: users.id, hash: users.passwordHash }).from(users)).some(
        (u) => u.hash !== null,
      ),
    ).toBe(true)
    expect(
      (await db.select().from(staffAccountLinks)).filter((l) => l.consumedAt !== null),
    ).toHaveLength(1)
  },
})

it('refuses a password under 12 characters and leaves the link usable', async () => {
  h.signOut()
  const token = await inviteToken()
  const refused = await setPassword(h.form({ token, password: 'short', confirm: 'short' }))
  expect(refused).toEqual({ error: 'Use at least 12 characters.' })
  const accepted = await settle(
    setPassword(h.form({ token, password: PASSWORD, confirm: PASSWORD })),
  )
  expect(accepted).toEqual(redirectsTo('/staff'))
})

it('sends a finished password reset to sign in rather than starting a session', async () => {
  h.signOut()
  const token = await inviteToken('password_reset')
  const result = await settle(setPassword(h.form({ token, password: PASSWORD, confirm: PASSWORD })))
  expect(result).toEqual(redirectsTo('/staff/sign-in?password=reset'))
})

it('refuses a link that was already used with the used-link copy', async () => {
  h.signOut()
  const token = await inviteToken()
  await settle(setPassword(h.form({ token, password: PASSWORD, confirm: PASSWORD })))
  const again = await setPassword(h.form({ token, password: PASSWORD, confirm: PASSWORD }))
  expect(again).toEqual({
    error: 'This invite link has already been used. Sign in with the password you chose.',
  })
})
