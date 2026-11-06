import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { processorAccounts } from '@/db/schema'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import type { PermitWorld } from '@/test/applicationFixtures'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const settingsActions = await import('@/app/(staff)/staff/settings/payments/actions')
const { publishAction } = await import('@/app/(staff)/staff/settings/actions')

const h = actionHarness()
const signal = new AbortController().signal
let world: PermitWorld

beforeAll(async () => {
  const made = await setupTradeWorld(h.db)
  world = made.world
  await setupPayments(h.db, world.admin)
})
beforeEach(() => {
  h.signIn(world.staff)
})

function paymentSettingsForm(basisPoints: number, fixedCents: number): FormData {
  return h.form({
    kind: 'payment_settings',
    key: 'default',
    body: JSON.stringify({
      key: 'default',
      convenienceFee: { basisPoints, fixedCents, appliesTo: ['card_online'] },
      receiptFooter: 'Thank you.',
      checksPayableTo: 'Town of Alder Pond',
    }),
  })
}

const CSRF_COPY = 'Your session expired. Reload the page and try again.'
describe('settings actions', () => {
  const stripeFields = {
    processor: 'stripe',
    mode: 'test',
    accountRef: 'acct_new',
    secretKey: 'sk_test_456',
    webhookSecret: 'whsec_456',
  }

  it('both settings actions refuse a missing csrf token', async () => {
    h.signIn(world.admin)
    expect(await settingsActions.saveProcessorAccountAction(h.form(stripeFields, null))).toEqual({
      ok: false,
      error: CSRF_COPY,
    })
    expect(await publishAction(h.form({}, null))).toEqual({
      ok: false,
      error: CSRF_COPY,
    })
  })

  it('admin saves a processor account and the secrets never appear in the reply', async () => {
    h.signIn(world.admin)
    const r = await settingsActions.saveProcessorAccountAction(h.form(stripeFields))
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r)).not.toContain('sk_test_456')
    const [active] = await h.db
      .select()
      .from(processorAccounts)
      .where(eq(processorAccounts.isActive, true))
    expect(active?.accountRef).toBe('acct_new')
  })

  it('staff saving an account is forbidden', async () => {
    const r = await settingsActions.saveProcessorAccountAction(h.form(stripeFields))
    expect(r).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('a simulated account is refused while the flag is off', async () => {
    h.signIn(world.admin)
    const r = await settingsActions.saveProcessorAccountAction(
      h.form({
        processor: 'simulated',
        mode: 'test',
        accountRef: 'sim_town',
        secretKey: '',
        webhookSecret: 'x',
      }),
    )
    expect(r).toEqual({
      ok: false,
      error: 'The simulated processor is turned off in this environment.',
      fieldErrors: { processor: 'The simulated processor is turned off in this environment.' },
    })
  })

  it('a stripe account without a secret key is invalid', async () => {
    h.signIn(world.admin)
    const r = await settingsActions.saveProcessorAccountAction(
      h.form({ ...stripeFields, secretKey: '' }),
    )
    expect(r).toEqual({
      ok: false,
      error: 'Enter the secret key.',
      fieldErrors: { secretKey: 'Enter the secret key.' },
    })
  })

  it('admin publishes the convenience fee and it is read back', async () => {
    h.signIn(world.admin)
    const r = await publishAction(paymentSettingsForm(250, 25))
    expect(r.ok).toBe(true)
    const settings = await getPaymentSettings(h.db, signal)
    expect(settings.convenienceFee).toEqual({
      basisPoints: 250,
      fixedCents: 25,
      appliesTo: ['card_online'],
    })
  })

  it('staff publishing payment settings is forbidden', async () => {
    const r = await publishAction(paymentSettingsForm(1, 0))
    expect(r).toMatchObject({ ok: false, error: 'You do not have permission to do this.' })
  })
})
