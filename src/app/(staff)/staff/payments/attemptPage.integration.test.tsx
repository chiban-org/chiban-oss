import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('../actions', () => ({
  checkWithProcessorAction: () => Promise.resolve({ ok: true }),
  voidAttemptAction: () => Promise.resolve({ ok: true }),
}))

const { default: AttemptPage } = await import('./[attemptId]/page')

let handle: TestDb
let world: PermitWorld
let attemptId = ''
let trade: Awaited<ReturnType<typeof submittedTrade>>

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  await setupPayments(handle.db, world.admin)
  trade = await submittedTrade(handle.db, world)
  attemptId = (await makeCardAttempt(handle.db, trade, 'card_present')).attemptId
})
afterAll(async () => {
  await handle.drop()
})

async function render(actor: Actor, id: string = attemptId): Promise<string> {
  state.actor = actor
  return renderToStaticMarkup(await AttemptPage({ params: Promise.resolve({ attemptId: id }) }))
}

describe('payment attempt page', () => {
  it('shows human labels, the status in the rail and the empty history with the empty panels', async () => {
    const html = await render(world.staff)
    expect(html).toContain('Card at the counter')
    expect(html).toContain('Waiting for the processor')
    expect(html).not.toContain('Status: Waiting')
    expect(html).not.toContain('card present')
    expect(html).toContain('record-rail')
    expect(html).toContain('Nothing recorded yet')
    expect(html).toContain('No events yet')
    expect(html).toContain('Stripe, test mode')
    expect(html).not.toContain('Processor: stripe')
  })

  it('tells staff to check with the processor before voiding when the outcome is unknown', async () => {
    const { attemptId: unknown } = await makeCardAttempt(handle.db, trade, 'card_present')
    await handle.db
      .update(paymentAttempts)
      .set({ outcomeUnknown: true })
      .where(eq(paymentAttempts.id, unknown))
    const html = await render(await staffActor(handle.db, 'finance'), unknown)
    expect(html).toContain('Outcome unknown')
    expect(html).toContain('Check with the processor before voiding')
    expect(html).toContain('Check with processor')
  })

  it('links a captured attempt to the receipt it produced', async () => {
    const made = await makeCardAttempt(handle.db, trade, 'card_online')
    await handle.db.transaction((tx) =>
      reconcileAttempt(
        tx,
        made.attemptId,
        processorState({ objectId: 'pi_receipt', amountCents: made.amountCents }),
        { kind: 'event' },
        new AbortController().signal,
      ),
    )
    const html = await render(world.staff, made.attemptId)
    expect(html).toContain('Captured')
    expect(html).toMatch(/href="\/staff\/receipts\/[0-9a-f-]{36}"/)
    expect(html).not.toContain('Void this attempt')
  })

  it('tells staff without payment access they lack permission, the same for any attempt id', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const html = await render(inspector)
    expect(html).toContain('You do not have permission to view payments.')
    expect(html).not.toContain('paid by card at the counter')
    state.actor = inspector
    const unknown = renderToStaticMarkup(
      await AttemptPage({
        params: Promise.resolve({ attemptId: '00000000-0000-4000-8000-000000000000' }),
      }),
    )
    expect(unknown).toContain('You do not have permission to view payments.')
  })

  it('hides the void control from staff who cannot void', async () => {
    const html = await render(world.staff)
    expect(html).not.toContain('Void this attempt')
  })

  it('offers the void control to finance', async () => {
    const finance = await staffActor(handle.db, 'finance')
    expect(await render(finance)).toContain('Void this attempt')
  })

  it('links to the application and splits the amount into the fee and the convenience fee', async () => {
    const html = await render(world.staff)
    expect(html).toContain(`href="/staff/applications/${trade.applicationId}"`)
    expect(html).toContain(trade.number)
    expect(html).toContain('Permit fees: $45.00')
    expect(html).toMatch(/Card convenience fee: \$\d+\.\d{2}/)
  })
})
