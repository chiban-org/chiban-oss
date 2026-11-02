import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applications,
  ledgerAllocations,
  ledgerEntries,
  receipts,
  refundRequests,
} from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { feeBalance } from '@/features/ledger/feeBalance'
import {
  correctEntry,
  recordChargeback,
  recordReturnedCheck,
  refundEntry,
} from '@/features/ledger/reversals'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { makeTestDb, type TestDb } from '@/test/db'
import { createFakeProcessor, type FakeProcessor } from '@/test/fakes/fakeProcessor'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
  tryIssue,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const REASON = 'Permit pulled in error'
let handle: TestDb
let trade: TradeFixture
let fake: FakeProcessor

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await setupPayments(handle.db, world.admin)
  fake = createFakeProcessor()
})
afterEach(async () => {
  await handle.drop()
})

const deps = () => ({ now: NOW, processorFactory: () => fake })

async function cashPayment(target: TradeFixture = trade, method: 'cash' | 'check' = 'cash') {
  const r = await recordCounterPayment(
    handle.db,
    trade.world.staff,
    {
      method,
      amountCents: 4500,
      checkNumber: method === 'check' ? '1042' : undefined,
      payerName: 'Pat Contractor',
      allocations: [lineAllocation(target, 4500)],
    },
    signal,
    NOW,
  )
  if (!r.ok) throw new Error(r.error)
  return r.value.entryId
}

async function cardPayment() {
  const { attemptId } = await makeCardAttempt(handle.db, trade)
  const state = processorState()
  fake.setState('pi_1', state)
  await handle.db.transaction((tx) =>
    reconcileAttempt(tx, attemptId, state, { kind: 'event' }, signal, NOW),
  )
  const [entry] = await handle.db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.entryType, 'payment'))
  return { entryId: entry?.id ?? '', attemptId }
}

async function finance() {
  return await staffActor(handle.db, 'finance')
}

describe('refundEntry', () => {
  it('staff refund is forbidden', async () => {
    const entryId = await cashPayment()
    const r = await refundEntry(
      handle.db,
      trade.world.staff,
      { entryId, amountCents: 1000, reason: REASON },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('refund without reason is reason_required', async () => {
    const entryId = await cashPayment()
    const r = await refundEntry(
      handle.db,
      await finance(),
      { entryId, amountCents: 1000, reason: 'short' },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'reason_required' })
  })

  it('cash refund of 4500 posts -4500 by cash', async () => {
    const entryId = await cashPayment()
    const r = await refundEntry(
      handle.db,
      await finance(),
      { entryId, amountCents: 4500, reason: REASON },
      signal,
      deps(),
    )
    expect(r.ok).toBe(true)
    const [refund] = await handle.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.entryType, 'refund'))
    expect(refund).toMatchObject({ amountCents: -4500, method: 'cash', reversesEntryId: entryId })
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(4500)
  })

  it('finance refund of 1000 on a 4635 card payment posts -1000 and a refund receipt', async () => {
    const { entryId } = await cardPayment()
    const r = await refundEntry(
      handle.db,
      await finance(),
      { entryId, amountCents: 1000, reason: REASON },
      signal,
      deps(),
    )
    expect(r.ok && r.value.receiptNumber).toMatch(/^R-2027-\d{6}$/)
    expect(fake.refunds).toEqual([{ objectId: 'pi_1', amountCents: 1000 }])
    const [refund] = await handle.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.entryType, 'refund'))
    expect(refund).toMatchObject({
      amountCents: -1000,
      method: 'card_online',
      processorObjectId: 're_fake_1',
    })
    const [receipt] = await handle.db.select().from(receipts).where(eq(receipts.kind, 'refund'))
    expect(receipt).toMatchObject({ totalCents: 1000 })
    expect(await handle.db.select().from(refundRequests)).toHaveLength(1)
  })

  it('a webhook for that refund afterwards posts nothing', async () => {
    const { entryId, attemptId } = await cardPayment()
    await refundEntry(
      handle.db,
      await finance(),
      { entryId, amountCents: 1000, reason: REASON },
      signal,
      deps(),
    )
    const reconciled = await handle.db.transaction((tx) =>
      reconcileAttempt(
        tx,
        attemptId,
        processorState({
          refunds: [{ objectId: 're_fake_1', amountCents: 1000, status: 'succeeded' }],
        }),
        { kind: 'event', eventId: 'evt_9' },
        signal,
        NOW,
      ),
    )
    expect(reconciled.ok && reconciled.value.entriesPosted).toBe(0)
    expect(
      await handle.db.select().from(ledgerEntries).where(eq(ledgerEntries.entryType, 'refund')),
    ).toHaveLength(1)
  })

  it('refund larger than the net paid is over_reversed and the processor is not called', async () => {
    const entryId = await cashPayment()
    const r = await refundEntry(
      handle.db,
      await finance(),
      { entryId, amountCents: 4501, reason: REASON },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'over_reversed' })
  })

  it('second refund after a full refund is over_reversed', async () => {
    const entryId = await cashPayment()
    const actor = await finance()
    await refundEntry(
      handle.db,
      actor,
      { entryId, amountCents: 4500, reason: REASON },
      signal,
      deps(),
    )
    const again = await refundEntry(
      handle.db,
      actor,
      { entryId, amountCents: 100, reason: REASON },
      signal,
      deps(),
    )
    expect(again).toEqual({ ok: false, error: 'over_reversed' })
  })

  it('a card refund over the net paid never reaches the processor', async () => {
    const { entryId } = await cardPayment()
    const r = await refundEntry(
      handle.db,
      await finance(),
      { entryId, amountCents: 9999, reason: REASON },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'over_reversed' })
    expect(fake.refunds).toEqual([])
  })

  it('refunding a refund is not_a_payment', async () => {
    const entryId = await cashPayment()
    const actor = await finance()
    await refundEntry(
      handle.db,
      actor,
      { entryId, amountCents: 100, reason: REASON },
      signal,
      deps(),
    )
    const [refund] = await handle.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.entryType, 'refund'))
    const r = await refundEntry(
      handle.db,
      actor,
      { entryId: refund?.id ?? '', amountCents: 50, reason: REASON },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'not_a_payment' })
  })

  it('admin holds the capability and succeeds', async () => {
    const entryId = await cashPayment()
    const r = await refundEntry(
      handle.db,
      trade.world.admin,
      { entryId, amountCents: 500, reason: REASON },
      signal,
      deps(),
    )
    expect(r.ok).toBe(true)
  })
})

describe('recordReturnedCheck', () => {
  it('returned check reverses 4500 and the permit stays issued with 4500 due', async () => {
    const entryId = await cashPayment(trade, 'check')
    expect((await tryIssue(handle.db, trade)).ok).toBe(true)
    const r = await recordReturnedCheck(
      handle.db,
      await finance(),
      { entryId, reason: 'Insufficient funds notice', returnedOn: '2027-03-05' as never },
      signal,
      deps(),
    )
    expect(r.ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, trade.applicationId))
    expect(row?.state).toBe('issued')
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(4500)
    const [returned] = await handle.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.entryType, 'returned_check'))
    expect(returned).toMatchObject({ amountCents: -4500, method: 'check', checkNumber: '1042' })
  })

  it('a cash payment is not_a_check', async () => {
    const entryId = await cashPayment()
    const r = await recordReturnedCheck(
      handle.db,
      await finance(),
      { entryId, reason: 'Insufficient funds notice', returnedOn: '2027-03-05' as never },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'not_a_check' })
  })

  it('a returned check cannot be recorded twice', async () => {
    const entryId = await cashPayment(trade, 'check')
    const input = {
      entryId,
      reason: 'Insufficient funds notice',
      returnedOn: '2027-03-05' as never,
    }
    await recordReturnedCheck(handle.db, await finance(), input, signal, deps())
    expect(await recordReturnedCheck(handle.db, await finance(), input, signal, deps())).toEqual({
      ok: false,
      error: 'over_reversed',
    })
  })

  it('staff cannot record a returned check', async () => {
    const entryId = await cashPayment(trade, 'check')
    const r = await recordReturnedCheck(
      handle.db,
      trade.world.staff,
      { entryId, reason: 'Insufficient funds notice', returnedOn: '2027-03-05' as never },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('recordChargeback and correctEntry', () => {
  it('a manual chargeback is keyed on the dispute reference', async () => {
    const { entryId } = await cardPayment()
    const input = {
      entryId,
      amountCents: 4635,
      disputeRef: 'dp_manual_1',
      reason: 'Bank dispute letter received',
    }
    const first = await recordChargeback(handle.db, await finance(), input, signal, deps())
    const again = await recordChargeback(handle.db, await finance(), input, signal, deps())
    expect(first.ok && again.ok && again.value.entryId).toBe(first.ok && first.value.entryId)
    expect(
      await handle.db.select().from(ledgerEntries).where(eq(ledgerEntries.entryType, 'chargeback')),
    ).toHaveLength(1)
  })

  it('a chargeback on a cash payment is not_a_card_payment', async () => {
    const entryId = await cashPayment()
    const r = await recordChargeback(
      handle.db,
      await finance(),
      { entryId, amountCents: 100, disputeRef: 'dp_x', reason: 'Bank dispute letter received' },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'not_a_card_payment' })
  })

  it('correction with delta 0 moves 4500 from one fee line to another', async () => {
    const other = await submittedTrade(handle.db, trade.world)
    const entryId = await cashPayment()
    const r = await correctEntry(
      handle.db,
      await finance(),
      {
        entryId,
        reason: 'Keyed against the wrong permit',
        amountDeltaCents: 0,
        allocations: [lineAllocation(trade, -4500), lineAllocation(other, 4500)],
      },
      signal,
      deps(),
    )
    expect(r.ok).toBe(true)
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(4500)
    expect((await feeBalance(handle.db, other.applicationId, signal)).dueCents).toBe(0)
    const rows = await handle.db.select().from(ledgerAllocations)
    expect(rows.filter((a) => a.amountCents < 0)).toHaveLength(1)
  })

  it('a correction whose allocations do not sum to the delta is amount_mismatch', async () => {
    const entryId = await cashPayment()
    const r = await correctEntry(
      handle.db,
      await finance(),
      {
        entryId,
        reason: 'Keyed against the wrong permit',
        amountDeltaCents: 100,
        allocations: [lineAllocation(trade, -4500)],
      },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'amount_mismatch' })
  })

  it('staff cannot correct an entry', async () => {
    const entryId = await cashPayment()
    const r = await correctEntry(
      handle.db,
      trade.world.staff,
      { entryId, reason: 'Keyed against the wrong permit', amountDeltaCents: 0, allocations: [] },
      signal,
      deps(),
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })
})
