import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import { resolveDevCheckout } from '@/features/payments/simulatedCheckout'
import { startOnlinePayment } from '@/features/payments/startPayment'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/requirePortal', () => ({
  portalActorOrNull: async () => state.actor,
}))
vi.mock('./PaymentStatusPoller', () => ({ PaymentStatusPoller: () => null }))

const { default: ReturnPage } = await import('./page')

const signal = new AbortController().signal
const deps = { now: new Date('2027-03-02T17:00:00Z'), enabled: true }
let handle: TestDb
let attemptId = ''
let processorObjectId = ''
let stranger: unknown = null
let payer: unknown = null

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const { world } = await setupTradeWorld(handle.db)
  const trade = await submittedTrade(handle.db, world)
  state.actor = world.applicant
  payer = world.applicant
  stranger = await staffActor(handle.db, 'applicant')
  await setupPayments(handle.db, world.admin, 'simulated', 'sim_town')
  const started = await startOnlinePayment(
    handle.db,
    world.applicant,
    { applicationIds: [trade.applicationId], payerName: 'Alex Applicant' },
    signal,
    deps,
  )
  if (!started.ok) throw new Error('start failed')
  attemptId = started.value.attemptId
  const [attempt] = await handle.db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  processorObjectId = attempt?.processorObjectId ?? ''
})
afterAll(async () => {
  await handle.drop()
})

async function render(): Promise<string> {
  return renderToStaticMarkup(await ReturnPage({ params: Promise.resolve({ attemptId }) }))
}

describe('payment return page', () => {
  it('shows only the waiting message while the processor has not confirmed', async () => {
    const html = await render()
    expect(html).toContain('Payment processing')
    expect(html).not.toContain('/payments/receipt/')
  })

  it('after a simulated capture shows the notice, amount, application, and receipt link', async () => {
    await resolveDevCheckout(handle.db, processorObjectId, 'approve', signal, deps)
    const html = await render()
    expect(html).toContain('Payment received')
    expect(html).toContain('SIMULATED')
    expect(html).toContain('$46.35')
    expect(html).toMatch(/EL-\d{4}-\d{4}/)
    expect(html).toContain(`/payments/receipt/${attemptId}`)
  })
})

describe('payment return page access', () => {
  it.each([
    ['another public user', () => stranger],
    ['a signed-out visitor', () => null],
  ])('%s sees the not-found page and no receipt link', async (_name, who) => {
    state.actor = who()
    const html = await render()
    state.actor = payer
    expect(html).toContain('Payment not found')
    expect(html).not.toContain('/payments/receipt/')
    expect(html).not.toContain('$46.35')
  })
})
