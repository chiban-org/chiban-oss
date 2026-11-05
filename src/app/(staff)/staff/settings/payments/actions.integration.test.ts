import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { processorAccounts } from '@/db/schema'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const settingsActions = await import('@/app/(staff)/staff/settings/payments/actions')
const { publishAction } = await import('@/app/(staff)/staff/settings/actions')

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const made = await setupTradeWorld(handle.db)
  world = made.world
  await setupPayments(handle.db, world.admin)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  state.actor = world.staff
})

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

function paymentSettingsForm(basisPoints: number, fixedCents: number): FormData {
  return form({
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
    state.actor = world.admin
    expect(await settingsActions.saveProcessorAccountAction(form(stripeFields, null))).toEqual({
      ok: false,
      error: CSRF_COPY,
    })
    expect(await publishAction(form({}, null))).toEqual({
      ok: false,
      error: CSRF_COPY,
    })
  })

  it('admin saves a processor account and the secrets never appear in the reply', async () => {
    state.actor = world.admin
    const r = await settingsActions.saveProcessorAccountAction(form(stripeFields))
    expect(r.ok).toBe(true)
    expect(JSON.stringify(r)).not.toContain('sk_test_456')
    const [active] = await handle.db
      .select()
      .from(processorAccounts)
      .where(eq(processorAccounts.isActive, true))
    expect(active?.accountRef).toBe('acct_new')
  })

  it('staff saving an account is forbidden', async () => {
    const r = await settingsActions.saveProcessorAccountAction(form(stripeFields))
    expect(r).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('a simulated account is refused while the flag is off', async () => {
    state.actor = world.admin
    const r = await settingsActions.saveProcessorAccountAction(
      form({
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
    })
  })

  it('a stripe account without a secret key is invalid', async () => {
    state.actor = world.admin
    const r = await settingsActions.saveProcessorAccountAction(
      form({ ...stripeFields, secretKey: '' }),
    )
    expect(r).toEqual({ ok: false, error: 'Check the form fields and try again.' })
  })

  it('admin publishes the convenience fee and it is read back', async () => {
    state.actor = world.admin
    const r = await publishAction(paymentSettingsForm(250, 25))
    expect(r.ok).toBe(true)
    const settings = await getPaymentSettings(handle.db, signal)
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
