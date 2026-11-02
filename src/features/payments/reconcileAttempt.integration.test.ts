import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ledgerAllocations,
  ledgerEntries,
  notificationOutbox,
  paymentAttempts,
  paymentAttemptTransitions,
} from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { feeBalance } from '@/features/ledger/feeBalance'
import type { ProcessorPaymentState } from '@/features/payments/processors/types'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
  tryIssue,
} from '@/test/ledgerFixtures'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let trade: TradeFixture
let attemptId: string

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin)
  attemptId = (await makeCardAttempt(handle.db, trade)).attemptId
})
afterEach(async () => {
  await handle.drop()
})

async function reconcile(
  state: ProcessorPaymentState,
  source: { kind: 'event' | 'reconcile' | 'staff' | 'reader'; eventId?: string } = {
    kind: 'event',
  },
) {
  return await handle.db.transaction((tx) =>
    reconcileAttempt(tx, attemptId, state, source, signal, NOW),
  )
}

async function entries() {
  return await handle.db.select().from(ledgerEntries)
}

async function attempt() {
  const [row] = await handle.db
    .select()
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  return row
}

describe('reconcileAttempt states', () => {
  it('authorized state posts no entry and fees.paid stays blocked', async () => {
    const r = await reconcile(processorState({ status: 'authorized' }))
    expect(r).toEqual({ ok: true, value: { state: 'authorized', entriesPosted: 0 } })
    expect(await entries()).toHaveLength(0)
    const issued = await tryIssue(handle.db, trade)
    expect(issued.ok).toBe(false)
  })

  it('an unknown attempt makes fees.paid unknown and blocks', async () => {
    await handle.db.update(paymentAttempts).set({ outcomeUnknown: true })
    const issued = await tryIssue(handle.db, trade)
    const gate =
      !issued.ok && typeof issued.error === 'object'
        ? issued.error.gateBlocked.find((g) => g.key === 'fees.paid')
        : undefined
    expect(gate).toMatchObject({
      effective: 'blocked',
      outcome: { status: 'unknown', reason: 'A card payment outcome is unknown.' },
    })
    expect((await feeBalance(handle.db, trade.applicationId, signal)).unknownAttempts).toBe(1)
  })

  it('a pending online attempt does not satisfy fees.paid', async () => {
    const balance = await feeBalance(handle.db, trade.applicationId, signal)
    expect(balance).toMatchObject({ pendingAttempts: 1, unknownAttempts: 0, dueCents: 4500 })
    expect((await tryIssue(handle.db, trade)).ok).toBe(false)
  })

  it('a captured online payment queues payment_received for the payer, once per receipt', async () => {
    await handle.db
      .update(paymentAttempts)
      .set({ payerUserId: trade.world.applicant.userId })
      .where(eq(paymentAttempts.id, attemptId))
    await reconcile(processorState())
    await reconcile(processorState())
    const rows = (await handle.db.select().from(notificationOutbox)).filter(
      (r) => r.event === 'payment_received',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      event: 'payment_received',
      recipientUserId: trade.world.applicant.userId,
      applicationId: trade.applicationId,
    })
    expect((rows[0]?.payload as { receiptNumber: string }).receiptNumber).toMatch(/^R-/)
  })

  it('captured state posts one 4635 payment allocated 4500 and 135', async () => {
    const r = await reconcile(processorState())
    expect(r).toEqual({ ok: true, value: { state: 'captured', entriesPosted: 1 } })
    const [entry] = await entries()
    expect(entry).toMatchObject({
      entryType: 'payment',
      method: 'card_online',
      amountCents: 4635,
      processorObjectId: 'pi_1',
    })
    const allocations = await handle.db
      .select()
      .from(ledgerAllocations)
      .where(eq(ledgerAllocations.entryId, entry?.id ?? ''))
    expect(allocations.map((a) => [a.targetKind, a.amountCents]).sort()).toEqual([
      ['convenience_fee', 135],
      ['fee_assessment_line', 4500],
    ])
    expect((await tryIssue(handle.db, trade)).ok).toBe(true)
  })

  it('settled after captured posts nothing new', async () => {
    await reconcile(processorState())
    const r = await reconcile(processorState({ settled: true }))
    expect(r).toEqual({ ok: true, value: { state: 'settled', entriesPosted: 0 } })
    expect(await entries()).toHaveLength(1)
  })

  it('canceled after captured writes an anomaly and keeps captured', async () => {
    await reconcile(processorState())
    const r = await reconcile(processorState({ status: 'canceled' }))
    expect(r).toEqual({ ok: true, value: { state: 'captured', entriesPosted: 0 } })
    expect((await attempt())?.anomaly).toContain('canceled')
  })

  it('amount mismatch posts nothing and writes the anomaly', async () => {
    await reconcile(processorState({ amountCents: 4000 }))
    expect(await entries()).toHaveLength(0)
    expect((await attempt())?.anomaly).toBe('amount_mismatch')
  })

  it('capture after the fee was paid in cash allocates the excess to overpayment', async () => {
    const cash = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat Contractor',
        allocations: [lineAllocation(trade, 4500)],
      },
      signal,
      NOW,
    )
    expect(cash.ok).toBe(true)
    await reconcile(processorState())
    const card = (await entries()).find((e) => e.method === 'card_online')
    const allocations = await handle.db
      .select()
      .from(ledgerAllocations)
      .where(eq(ledgerAllocations.entryId, card?.id ?? ''))
    expect(allocations.map((a) => [a.targetKind, a.amountCents]).sort()).toEqual([
      ['convenience_fee', 135],
      ['overpayment', 4500],
    ])
    expect((await feeBalance(handle.db, trade.applicationId, signal)).lines[0]).toMatchObject({
      paidCents: 4500,
      dueCents: 0,
    })
  })

  it('foreign account ref is refused and nothing changes', async () => {
    const r = await reconcile(processorState({ accountRef: 'acct_other' }))
    expect(r).toEqual({ ok: false, error: 'foreign_object' })
    expect(await entries()).toHaveLength(0)
    expect((await attempt())?.state).toBe('pending')
    expect(await handle.db.select().from(paymentAttemptTransitions)).toHaveLength(0)
  })

  it('a pending state with outcome_unknown keeps the flag and posts nothing', async () => {
    await handle.db.update(paymentAttempts).set({ outcomeUnknown: true })
    const r = await reconcile(processorState({ status: 'pending' }))
    expect(r).toEqual({ ok: true, value: { state: 'pending', entriesPosted: 0 } })
    expect((await attempt())?.outcomeUnknown).toBe(true)
    expect(await entries()).toHaveLength(0)
  })

  it('a resolved state clears outcome_unknown and records one transition', async () => {
    await handle.db.update(paymentAttempts).set({ outcomeUnknown: true })
    await reconcile(processorState({ status: 'declined' }), { kind: 'staff' })
    expect(await attempt()).toMatchObject({ state: 'declined', outcomeUnknown: false })
    expect(await handle.db.select().from(paymentAttemptTransitions)).toMatchObject([
      { fromState: 'pending', toState: 'declined', source: 'staff' },
    ])
  })
})

describe('reconcileAttempt reversals', () => {
  const captured = processorState()
  const refunded = processorState({
    refunds: [{ objectId: 're_1', amountCents: 1000, status: 'succeeded' }],
  })
  const disputed = processorState({
    disputes: [{ objectId: 'dp_1', amountCents: 4635, status: 'lost' }],
  })
  const arrivals: [string, ProcessorPaymentState[]][] = [
    ['captured, refunded, disputed', [captured, refunded, disputed]],
    ['captured, disputed, refunded', [captured, disputed, refunded]],
    ['refunded, captured, disputed', [refunded, captured, disputed]],
    ['refunded, disputed, captured', [refunded, disputed, captured]],
    ['disputed, captured, refunded', [disputed, captured, refunded]],
    ['disputed, refunded, captured', [disputed, refunded, captured]],
  ]

  it.each(arrivals)('three events arriving as %s post the same entries', async (_name, order) => {
    for (const state of [...order, ...order]) await reconcile(state)
    const posted = await entries()
    expect(posted.map((e) => e.entryType).sort()).toEqual(['chargeback', 'payment', 'refund'])
    expect(posted.reduce((sum, e) => sum + e.amountCents, 0)).toBe(-1000)
    const balance = await feeBalance(handle.db, trade.applicationId, signal)
    expect(balance.lines[0]).toMatchObject({ paidCents: 0, dueCents: 4500 })
    const allocations = await handle.db.select().from(ledgerAllocations)
    const net = (kind: string) =>
      allocations.filter((a) => a.targetKind === kind).reduce((s, a) => s + a.amountCents, 0)
    expect([net('fee_assessment_line'), net('convenience_fee'), net('overpayment')]).toEqual([
      0, 0, -1000,
    ])
  })

  it('a refund prorates over the line and the convenience fee', async () => {
    await reconcile(refunded)
    const refund = (await entries()).find((e) => e.entryType === 'refund')
    const allocations = await handle.db
      .select()
      .from(ledgerAllocations)
      .where(eq(ledgerAllocations.entryId, refund?.id ?? ''))
    expect(allocations.map((a) => [a.targetKind, a.amountCents]).sort()).toEqual([
      ['convenience_fee', -29],
      ['fee_assessment_line', -971],
    ])
  })

  it('won dispute posts the chargeback then a correction', async () => {
    await reconcile(
      processorState({ disputes: [{ objectId: 'dp_1', amountCents: 4635, status: 'open' }] }),
    )
    await reconcile(
      processorState({ disputes: [{ objectId: 'dp_1', amountCents: 4635, status: 'won' }] }),
    )
    const posted = await entries()
    expect(posted.map((e) => e.entryType).sort()).toEqual(['chargeback', 'correction', 'payment'])
    expect(posted.reduce((sum, e) => sum + e.amountCents, 0)).toBe(4635)
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(0)
  })

  it('a won dispute seen first still posts the chargeback and the correction', async () => {
    await reconcile(
      processorState({ disputes: [{ objectId: 'dp_1', amountCents: 4635, status: 'won' }] }),
    )
    expect((await entries()).map((e) => e.entryType).sort()).toEqual([
      'chargeback',
      'correction',
      'payment',
    ])
  })

  it('a pending refund posts nothing', async () => {
    await reconcile(
      processorState({ refunds: [{ objectId: 're_1', amountCents: 1000, status: 'pending' }] }),
    )
    expect(await entries()).toHaveLength(1)
  })
})
