import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { recordOutcomeByHand } from '@/features/payments/manualOutcome'
import { MANUAL_OUTCOME_AFTER_MS } from '@/features/payments/manualOutcomeCheck'
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
  recordOutcomeByHandAction: () => Promise.resolve({ ok: true }),
}))

const { default: AttemptPage } = await import('./[attemptId]/page')

const signal = new AbortController().signal
const NOTE = 'Clover support line, agent Sam, ref CLV-77'
let handle: TestDb
let world: PermitWorld
let finance: Actor
let trade: Awaited<ReturnType<typeof submittedTrade>>

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  await setupPayments(handle.db, world.admin)
  trade = await submittedTrade(handle.db, world)
  finance = await staffActor(handle.db, 'finance')
})
afterAll(async () => {
  await handle.drop()
})

async function stuck(ageMs: number): Promise<{ id: string; amountCents: number }> {
  const made = await makeCardAttempt(handle.db, trade, 'card_present')
  await handle.db
    .update(paymentAttempts)
    .set({
      processorObjectId: `pi_${made.attemptId.slice(0, 8)}`,
      outcomeUnknown: true,
      updatedAt: new Date(Date.now() - ageMs),
    })
    .where(eq(paymentAttempts.id, made.attemptId))
  return { id: made.attemptId, amountCents: made.amountCents }
}

async function render(actor: Actor, id: string): Promise<string> {
  state.actor = actor
  return renderToStaticMarkup(await AttemptPage({ params: Promise.resolve({ attemptId: id }) }))
}

describe('recording a card outcome by hand on the attempt page', () => {
  it('offers the form to finance once the attempt has waited past the threshold', async () => {
    const { id } = await stuck(MANUAL_OUTCOME_AFTER_MS + 60_000)
    const html = await render(finance, id)
    expect(html).toContain('Record outcome')
    expect(html).toContain('Processor confirms declined')
    expect(html).toContain('Processor confirms approved')
    expect(html).toContain('has not confirmed this payment for over a day')
  })

  it('does not offer it before the threshold or to staff who cannot void', async () => {
    const young = await stuck(MANUAL_OUTCOME_AFTER_MS - 60_000)
    expect(await render(finance, young.id)).not.toContain('Record outcome')
    const old = await stuck(MANUAL_OUTCOME_AFTER_MS + 60_000)
    expect(await render(world.staff, old.id)).not.toContain('Record outcome')
  })

  it('shows who recorded the outcome, when, how and the note, and no longer offers it', async () => {
    const { id } = await stuck(MANUAL_OUTCOME_AFTER_MS + 60_000)
    const done = await recordOutcomeByHand(
      handle.db,
      finance,
      { attemptId: id, outcome: 'approved', note: NOTE },
      signal,
    )
    expect(done.ok).toBe(true)
    const html = await render(world.staff, id)
    expect(html).toContain('Outcome recorded by hand')
    expect(html).toContain('Processor confirms approved. Recorded by')
    expect(html).toContain(`Note: ${NOTE}`)
    expect(await render(finance, id)).not.toContain('Record outcome')
  })

  it('shows a later processor report that disagrees as a mismatch', async () => {
    trade = await submittedTrade(handle.db, world)
    const { id, amountCents } = await stuck(MANUAL_OUTCOME_AFTER_MS + 60_000)
    await recordOutcomeByHand(
      handle.db,
      finance,
      { attemptId: id, outcome: 'approved', note: NOTE },
      signal,
    )
    await handle.db.transaction((tx) =>
      reconcileAttempt(
        tx,
        id,
        processorState({ objectId: `pi_${id.slice(0, 8)}`, status: 'declined', amountCents }),
        { kind: 'event' },
        signal,
      ),
    )
    const html = await render(finance, id)
    expect(html).toContain('Processor disagrees')
    expect(html).toContain('The processor later reported this payment as declined')
    expect(html).toContain('Captured')
  })
})
