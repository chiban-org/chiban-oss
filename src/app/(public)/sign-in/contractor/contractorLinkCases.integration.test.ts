import { expect, it, vi } from 'vitest'
import { magicLinks } from '@/db/schema'
import { resetMagicLinkLimiter } from '@/features/auth/magicLink'
import { actionHarness, type FieldSpec, text } from '@/test/testHarness/actions'
import { describeAnonymousCases } from '@/test/testHarness/actions/anonymousCases'
import type { ContractorLinkState } from './actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { requestContractorLinkAction } = await import('./actions')

const h = actionHarness()

const SESSION = 'Your session expired. Reload the page and try again.'
const NOT_AN_EMAIL = 'Enter an email address like name@example.com.'

const email: FieldSpec = {
  ...text({ required: true }),
  variants: [
    ...text({ required: true }).variants,
    { kind: 'letters', label: 'as text with no at sign', value: 'not-an-email' },
  ],
}

const request = (form: FormData): Promise<ContractorLinkState> =>
  requestContractorLinkAction({ status: 'idle' }, form)

describeAnonymousCases(h, 'requestContractorLinkAction', {
  invoke: request,
  input: () => ({ email: 'Pat@Alderpond.example' }),
  fields: { email },
  refusals: {
    csrf: { status: 'refused', message: SESSION },
    checkOnly: { status: 'refused', message: SESSION },
    invalid: (v) => ({
      status: 'refused' as const,
      message: v.kind === 'letters' ? NOT_AN_EMAIL : 'Enter an email address.',
    }),
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ status: 'sent', email: 'pat@alderpond.example' })
    expect(written).toEqual(['magic_links'])
    const [link] = await db.select().from(magicLinks)
    expect(link?.nextPath).toBe('/account?setup=contractor')
    expect(h.mail.sent.map((m) => m.to)).toEqual(['pat@alderpond.example'])
  },
})

it('refuses after too many requests for one address', async () => {
  resetMagicLinkLimiter()
  h.signOut()
  for (let i = 0; i < 5; i += 1) await request(h.form({ email: 'busy@alderpond.example' }))
  expect(await request(h.form({ email: 'busy@alderpond.example' }))).toEqual({
    status: 'refused',
    message: 'Too many requests. Try again in a few minutes.',
  })
})
