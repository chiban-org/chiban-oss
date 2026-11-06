import { expect, it, vi } from 'vitest'
import { hashPassword } from '@/features/auth/password'
import { resetStaffSignInLimiter } from '@/features/auth/staffSignIn'
import { currentTotpCode, generateTotpSecret } from '@/features/auth/totp'
import { encryptSecret } from '@/server/secrets'
import { makeUser } from '@/test/factories'
import { actionHarness, redirectsTo, settle, text } from '@/test/testHarness/actions'
import { describeAnonymousCases } from '@/test/testHarness/actions/anonymousCases'
import type { SignInState } from './actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { signInAction } = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
const PASSWORD = 'a-long-staff-password'
const EMAIL = 'clerk@alderpond.example'
const SESSION: SignInState = {
  error: 'Your session expired. Reload the page and try again.',
  needTotp: false,
}
const INCORRECT: SignInState = { error: 'Email or password is incorrect.', needTotp: false }

let clerk: Promise<string> | null = null

const signIn = (form: FormData): Promise<SignInState> =>
  signInAction({ error: null, needTotp: false }, form)

async function staff(email: string, totp?: string) {
  return await makeUser(h.db, {
    email,
    role: 'staff',
    passwordHash: await hashPassword(PASSWORD, signal),
    totpSecretEnc: totp === undefined ? null : encryptSecret(totp),
    totpEnabled: totp !== undefined,
  })
}

describeAnonymousCases(h, 'signInAction', {
  invoke: signIn,
  input: async () => {
    resetStaffSignInLimiter()
    clerk ??= staff(EMAIL)
    await clerk
    return { email: EMAIL, password: PASSWORD }
  },
  fields: { email: text({ required: true }), password: text({ required: true }) },
  refusals: { csrf: SESSION, checkOnly: SESSION, invalid: INCORRECT },
  accepted: (result, { written }) => {
    expect(result).toEqual(redirectsTo('/staff'))
    expect(written).toEqual(expect.arrayContaining(['audit_log', 'sessions']))
  },
})

it('asks for the authenticator code when the account has one enrolled and none was sent', async () => {
  resetStaffSignInLimiter()
  h.signOut()
  await staff('enrolled@alderpond.example', generateTotpSecret())
  const result = await signIn(h.form({ email: 'enrolled@alderpond.example', password: PASSWORD }))
  expect(result).toEqual({ error: null, needTotp: true })
})

it('signs in with the right authenticator code', async () => {
  resetStaffSignInLimiter()
  h.signOut()
  const secret = generateTotpSecret()
  await staff('coded@alderpond.example', secret)
  const result = await settle(
    signIn(
      h.form({
        email: 'coded@alderpond.example',
        password: PASSWORD,
        totp: currentTotpCode(secret, Date.now()),
      }),
    ),
  )
  expect(result).toEqual(redirectsTo('/staff'))
})

it('refuses a wrong authenticator code with the generic copy that mentions the code', async () => {
  resetStaffSignInLimiter()
  h.signOut()
  await staff('wrongcode@alderpond.example', generateTotpSecret())
  const result = await signIn(
    h.form({ email: 'wrongcode@alderpond.example', password: PASSWORD, totp: '000000' }),
  )
  expect(result).toEqual({ error: 'Email, password, or code is incorrect.', needTotp: true })
})

it('answers an unknown email and a wrong password with the same line', async () => {
  resetStaffSignInLimiter()
  h.signOut()
  await staff('known@alderpond.example')
  const unknown = await signIn(h.form({ email: 'nobody@alderpond.example', password: PASSWORD }))
  const wrong = await signIn(
    h.form({ email: 'known@alderpond.example', password: 'wrong-password-here' }),
  )
  expect([unknown, wrong]).toEqual([INCORRECT, INCORRECT])
})
