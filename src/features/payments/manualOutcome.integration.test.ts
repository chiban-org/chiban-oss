import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, ledgerEntries, paymentAttempts, paymentAttemptTransitions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { recordOutcomeByHand } from '@/features/payments/manualOutcome'
import { MANUAL_OUTCOME_AFTER_MS } from '@/features/payments/manualOutcomeCheck'
import type { ProcessorPaymentState } from '@/features/payments/processors/types'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { checkWithProcessor } from '@/features/payments/startPayment'
import { makeTestDb, type TestDb } from '@/test/db'
import { createFakeProcessor } from '@/test/fakes/fakeProcessor'
import { setupTradeWorld, submittedTrade, type TradeFixture, tryIssue } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const PAST = new Date(NOW.getTime() - MANUAL_OUTCOME_AFTER_MS)
const NOTE = 'Processor ref ch_889 confirmed by phone with Dana'
let handle: TestDb
let trade: TradeFixture
let finance: Actor
let attemptId: string
let amountCents: number

async function stuck(objectId: string | null, updatedAt: Date = PAST): Promise<string> {
  const made = await makeCardAttempt(handle.db, trade, 'card_present')
  await handle.db
    .update(paymentAttempts)
    .set({ processorObjectId: objectId, outcomeUnknown: true, updatedAt })
    .where(eq(paymentAttempts.id, made.attemptId))
  amountCents = made.amountCents
  return made.attemptId
}

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin)
  finance = await staffActor(handle.db, 'finance')
  attemptId = await stuck('pi_stuck')
})
afterEach(async () => {
  await handle.drop()
})

function record(
  outcome: 'approved' | 'declined',
  overrides: { actor?: Actor; note?: string; processorRef?: string; id?: string } = {},
) {
  return recordOutcomeByHand(
    handle.db,
    overrides.actor ?? finance,
    {
      attemptId: overrides.id ?? attemptId,
      outcome,
      note: overrides.note ?? NOTE,
      now: NOW,
      ...(overrides.processorRef === undefined ? {} : { processorRef: overrides.processorRef }),
    },
    signal,
  )
}

async function row(id: string = attemptId) {
  const [found] = await handle.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id))
  return found
}

async function payments(id: string = attemptId) {
  return await handle.db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.paymentAttemptId, id), eq(ledgerEntries.entryType, 'payment')))
}

async function transitions(id: string = attemptId) {
  return await handle.db
    .select()
    .from(paymentAttemptTransitions)
    .where(eq(paymentAttemptTransitions.attemptId, id))
}

async function processorSays(partial: Partial<ProcessorPaymentState>, id: string = attemptId) {
  return await handle.db.transaction((tx) =>
    reconcileAttempt(
      tx,
      id,
      processorState({ objectId: 'pi_stuck', amountCents, ...partial }),
      { kind: 'event' },
      signal,
      NOW,
    ),
  )
}

describe('recording a card outcome by hand: refusals', () => {
  it('refuses before the attempt has been pending past the threshold', async () => {
    const young = await stuck(
      'pi_young',
      new Date(NOW.getTime() - MANUAL_OUTCOME_AFTER_MS + 60_000),
    )
    expect(await record('approved', { id: young })).toEqual({ ok: false, error: 'too_soon' })
    expect((await row(young))?.state).toBe('pending')
  })

  it('refuses staff without the void and correct capability', async () => {
    const clerk = await staffActor(handle.db, 'staff')
    expect(await record('approved', { actor: clerk })).toEqual({ ok: false, error: 'forbidden' })
    expect(await payments()).toHaveLength(0)
  })

  it('refuses without a note', async () => {
    expect(await record('declined', { note: '   ' })).toEqual({
      ok: false,
      error: 'note_required',
    })
    expect((await row())?.state).toBe('pending')
  })

  it('refuses an attempt that is no longer pending', async () => {
    await handle.db
      .update(paymentAttempts)
      .set({ state: 'declined' })
      .where(eq(paymentAttempts.id, attemptId))
    expect(await record('approved')).toEqual({ ok: false, error: 'not_pending' })
    expect(await payments()).toHaveLength(0)
  })
})

describe('recording a card outcome by hand: approved', () => {
  it('posts one payment through the normal path even when submitted twice at once', async () => {
    const results = await Promise.all([record('approved'), record('approved')])
    expect(results.filter((r) => r.ok)).toEqual([{ ok: true, value: { state: 'captured' } }])
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'not_pending' }])
    expect(await payments()).toHaveLength(1)
    expect((await payments())[0]).toMatchObject({ amountCents, processorObjectId: 'pi_stuck' })
    expect(await transitions()).toMatchObject([
      { fromState: 'pending', toState: 'captured', source: 'staff' },
    ])
    expect(await row()).toMatchObject({
      state: 'captured',
      outcomeUnknown: false,
      manualOutcome: 'approved',
      manualNote: NOTE,
      manualByUserId: finance.userId,
      manualAt: NOW,
    })
    expect((await tryIssue(handle.db, trade)).ok).toBe(true)
  })

  it('writes the resolution to the audit log with the note and the staff member', async () => {
    await record('approved')
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'payment.attempt.manual_outcome'))
    expect(audit).toMatchObject({
      actorUserId: finance.userId,
      entityType: 'payment_attempt',
      entityId: attemptId,
      after: { outcome: 'approved', note: NOTE },
    })
  })

  it('needs the processor reference when the attempt never got a processor object', async () => {
    const bare = await stuck(null)
    expect(await record('approved', { id: bare })).toEqual({
      ok: false,
      error: 'reference_required',
    })
    expect(await record('approved', { id: bare, processorRef: 'pi_stuck' })).toEqual({
      ok: false,
      error: 'reference_in_use',
    })
    expect(await record('approved', { id: bare, processorRef: ' pi_phone ' })).toEqual({
      ok: true,
      value: { state: 'captured' },
    })
    expect((await row(bare))?.processorObjectId).toBe('pi_phone')
    expect((await payments(bare))[0]?.processorObjectId).toBe('pi_phone')
  })
})

describe('recording a card outcome by hand: declined', () => {
  it('closes the attempt like a normal decline and posts nothing', async () => {
    expect(await record('declined')).toEqual({ ok: true, value: { state: 'declined' } })
    expect(await row()).toMatchObject({
      state: 'declined',
      outcomeUnknown: false,
      manualOutcome: 'declined',
    })
    expect(await transitions()).toMatchObject([
      { fromState: 'pending', toState: 'declined', source: 'staff' },
    ])
    expect(await payments()).toHaveLength(0)
    expect((await tryIssue(handle.db, trade)).ok).toBe(false)
  })

  it('closes an attempt that never got a processor object without asking for a reference', async () => {
    const bare = await stuck(null)
    expect(await record('declined', { id: bare })).toEqual({
      ok: true,
      value: { state: 'declined' },
    })
    expect((await row(bare))?.processorObjectId).toBeNull()
  })
})

describe('the processor reporting after a manual outcome', () => {
  it('flags nothing while the processor still reports pending', async () => {
    await record('approved')
    await processorSays({ status: 'pending' })
    expect(await row()).toMatchObject({ state: 'captured', anomaly: null, processorMismatch: null })
  })

  it('check with processor says what the processor reports and keeps the outcome by hand', async () => {
    await record('approved')
    const fake = createFakeProcessor()
    fake.setState(
      'pi_stuck',
      processorState({ objectId: 'pi_stuck', status: 'pending', amountCents }),
    )
    const checked = await checkWithProcessor(handle.db, finance, attemptId, signal, {
      now: NOW,
      processorFactory: () => fake,
    })
    expect(checked).toEqual({
      ok: true,
      value: { state: 'captured', outcomeUnknown: false, processorStatus: 'pending', byHand: true },
    })
    expect(await row()).toMatchObject({ state: 'captured', anomaly: null })
  })

  it('posts nothing more when the processor later agrees', async () => {
    await record('approved')
    await processorSays({ status: 'captured' })
    expect(await payments()).toHaveLength(1)
    expect(await row()).toMatchObject({ state: 'captured', processorMismatch: null })
  })

  it('keeps an approval and records the mismatch when the processor later declines', async () => {
    await record('approved')
    await processorSays({ status: 'declined' })
    expect(await row()).toMatchObject({
      state: 'captured',
      manualOutcome: 'approved',
      processorMismatch: 'declined',
    })
    expect((await row())?.anomaly).not.toBeNull()
    expect(await payments()).toHaveLength(1)
  })

  it('keeps a decline and posts nothing when the processor later captures', async () => {
    await record('declined')
    await processorSays({ status: 'captured' })
    expect(await row()).toMatchObject({ state: 'declined', processorMismatch: 'captured' })
    expect(await payments()).toHaveLength(0)
  })

  it('treats a later cancel as agreeing with a decline', async () => {
    await record('declined')
    await processorSays({ status: 'canceled' })
    expect(await row()).toMatchObject({ state: 'declined', anomaly: null, processorMismatch: null })
  })
})
