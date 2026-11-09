import { expect, it, vi } from 'vitest'
import { magicLinks } from '@/db/schema'
import { resetMagicLinkLimiter } from '@/features/auth/magicLink'
import { makeUser } from '@/test/factories'
import { actionHarness, type FieldSpec, text } from '@/test/testHarness/actions'
import { describeAnonymousCases } from '@/test/testHarness/actions/anonymousCases'
import type { MagicLinkState } from './actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const { requestMagicLinkAction } = await import('./actions')

const h = actionHarness()

const SENT = 'If that address can sign in, a link is on its way. It expires in 15 minutes.'
const SESSION = 'Your session expired. Reload the page and try again.'
const NOT_AN_EMAIL = 'Enter an email address like name@example.com.'

const email: FieldSpec = {
  ...text({ required: true }),
  variants: [
    ...text({ required: true }).variants,
    { kind: 'letters', label: 'as text with no at sign', value: 'not-an-email' },
  ],
}

const request = (form: FormData): Promise<MagicLinkState> =>
  requestMagicLinkAction({ message: null }, form)

describeAnonymousCases(h, 'requestMagicLinkAction', {
  invoke: request,
  input: () => ({ email: 'pat@alderpond.example' }),
  fields: { email },
  refusals: {
    csrf: { message: SESSION },
    checkOnly: { message: SESSION },
    invalid: (v) => ({ message: v.kind === 'letters' ? NOT_AN_EMAIL : 'Enter an email address.' }),
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ message: SENT, sentTo: 'pat@alderpond.example' })
    expect(written).toEqual(['magic_links'])
    expect((await db.select().from(magicLinks)).map((l) => l.email)).toEqual([
      'pat@alderpond.example',
    ])
    expect(h.mail.sent.map((m) => m.to)).toEqual(['pat@alderpond.example'])
  },
})

it('answers an address that cannot sign in exactly as it answers one that can, and sends nothing', async () => {
  resetMagicLinkLimiter()
  h.signOut()
  await makeUser(h.db, { email: 'clerk@alderpond.example', role: 'staff' })
  const result = await request(h.form({ email: 'clerk@alderpond.example' }))
  expect(result).toEqual({ message: SENT, sentTo: 'clerk@alderpond.example' })
  expect(h.mail.sent).toEqual([])
})
