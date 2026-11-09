import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import { resolveDevCheckout } from '@/features/payments/simulatedCheckout'
import { startOnlinePayment } from '@/features/payments/startPayment'
import { publishTownProfileSection } from '@/features/town/profileSettings'
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
  portalActorOrNull: () => Promise.resolve(state.actor),
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
let applicationId = ''
let world: Awaited<ReturnType<typeof setupTradeWorld>>['world']

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  const trade = await submittedTrade(handle.db, world)
  applicationId = trade.applicationId
  state.actor = world.applicant
  payer = world.applicant
  stranger = await staffActor(handle.db, 'applicant')
  await setupPayments(handle.db, world.admin, 'simulated', 'sim_town')
  await publishTownProfileSection(
    handle.db,
    world.admin,
    {
      section: 'profile',
      slice: {
        officeName: 'Land Use Office',
        addressLines: ['1 Main Street'],
        phone: '603-555-0100',
        email: '',
        website: '',
        officeHours: '',
        logo: null,
      },
    },
    signal,
  )
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

async function render(id = attemptId): Promise<string> {
  return renderToStaticMarkup(await ReturnPage({ params: Promise.resolve({ attemptId: id }) }))
}

describe('payment return page', () => {
  it('shows only the waiting message while the processor has not confirmed', async () => {
    const html = await render()
    expect(html).toContain('Payment processing')
    expect(html).not.toContain('/payments/receipt/')
  })

  it('links back to the application while the processor has not confirmed', async () => {
    const html = await render()
    expect(html).toContain(`href="/portal/applications/${applicationId}"`)
  })

  it('after a simulated capture shows the notice, amount, application, and receipt link', async () => {
    await resolveDevCheckout(handle.db, processorObjectId, 'approve', signal, deps)
    const html = await render()
    expect(html).toContain('Payment received')
    expect(html).toContain('SIMULATED')
    expect(html).toContain('$46.35')
    expect(html).toMatch(/EL-\d{4}-\d{4}/)
    expect(html).toContain(`/payments/receipt/${attemptId}`)
    expect(html).toContain(`href="/portal/applications/${applicationId}"`)
  })

  it('once received shows the receipt number and each fee line, the convenience fee included', async () => {
    const html = await render()
    expect(html).toMatch(/R-\d{4}-\d{4,}/)
    expect(html).toContain('Convenience fee')
    expect(html).toContain('data-slot="practice-notice"')
    expect(html).not.toContain('bg-highlight')
    expect(html).not.toContain('max-w-md')
  })

  it('a declined payment links back to the application to try again', async () => {
    const other = await submittedTrade(handle.db, world)
    const started = await startOnlinePayment(
      handle.db,
      world.applicant,
      { applicationIds: [other.applicationId], payerName: 'Alex Applicant' },
      signal,
      deps,
    )
    if (!started.ok) throw new Error('start failed')
    const [attempt] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, started.value.attemptId))
    await resolveDevCheckout(handle.db, attempt?.processorObjectId ?? '', 'decline', signal, deps)
    const html = await render(started.value.attemptId)
    expect(html).toContain('Payment declined')
    expect(html).toContain(`href="/portal/applications/${other.applicationId}"`)
    expect(html).toContain('Try the payment again')
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

  it('explains a missing payment to a signed-out visitor and offers sign in back to this page', async () => {
    state.actor = null
    const html = await render()
    state.actor = payer
    expect(html).toContain(`href="/sign-in?next=%2Fpayments%2Freturn%2F${attemptId}"`)
    expect(html).toContain('Your application page shows every payment.')
    expect(html).toContain('603-555-0100')
  })
})
