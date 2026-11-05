import { NH_STARTERS } from '@packs/nh/starters'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, ledgerEntries, paymentAttempts, receipts, refundRequests } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { quickIssue } from '@/features/counter/quickIssue'
import { feeBalance } from '@/features/ledger/feeBalance'
import { receiptPdfResponse } from '@/features/ledger/receiptAccess'
import { refundEntry } from '@/features/ledger/reversals'
import type { ProcessorPaymentState } from '@/features/payments/processors/types'
import { reconcileAttempt } from '@/features/payments/reconcileAttempt'
import { checkWithProcessor, voidAttempt } from '@/features/payments/startPayment'
import { runJob } from '@/jobs/defineJob'
import { makePaymentsReconcileJob } from '@/jobs/paymentsReconcile'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { createFakeProcessor, type FakeProcessor } from '@/test/fakes/fakeProcessor'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, processorState, setupPayments } from '@/test/paymentFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
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
const entries = async () => await handle.db.select().from(ledgerEntries)

async function reconcile(attemptId: string, state: ProcessorPaymentState) {
  return await handle.db.transaction((tx) =>
    reconcileAttempt(tx, attemptId, state, { kind: 'event' }, signal, NOW),
  )
}

describe('finding 1: direct issue with fees due at approval', () => {
  it('collects the approval fee before issuing', async () => {
    const starter = NH_STARTERS.find((s) => s.id === 'nh.starter.electrical')
    if (starter === undefined) throw new Error('starter')
    const { world } = trade
    await saveAndPublish(handle.db, world.admin, 'fee_schedule', 'el-fees', {
      ...starter.feeSchedule,
      lines: starter.feeSchedule.lines.map((l) => ({ ...l, due: 'at_approval' })),
    })
    await saveAndPublish(handle.db, world.admin, 'application_type', 'EL', {
      ...starter.applicationType,
      payTiming: 'at_approval',
    })
    const issued = await quickIssue(
      handle.db,
      world.staff,
      {
        parcelId: world.parcelId,
        applicationTypeKey: 'EL',
        values: { description: 'Panel upgrade' },
        contractor: { name: 'Pat' },
        license: { number: 'EL-1', type: 'Electrician', result: 'active' },
        payerName: 'Pat',
        payment: { method: 'cash', tenderedCents: 5000 },
      },
      signal,
      { now: NOW },
    )
    expect(issued.ok && issued.value.state).toBe('issued')
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.number, issued.ok ? issued.value.number : ''))
    expect((await feeBalance(handle.db, row?.id ?? '', signal)).dueCents).toBe(0)
    expect((await entries()).filter((e) => e.amountCents === 4500)).toHaveLength(1)
  })
})

describe('finding 2 and 5: dispute outcomes do not depend on arrival order', () => {
  const dispute = (status: 'open' | 'won' | 'lost') => ({
    objectId: 'dp_1',
    amountCents: 4635,
    status,
  })
  const refund = { objectId: 're_1', amountCents: 1000, status: 'succeeded' as const }

  async function paidAfter(steps: ProcessorPaymentState[]): Promise<number> {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    for (const step of steps) await reconcile(attemptId, step)
    return (await feeBalance(handle.db, trade.applicationId, signal)).lines[0]?.paidCents ?? -1
  }

  it('an open dispute seen first and a refund with the win later match seeing it all at once', async () => {
    const together = await paidAfter([
      processorState({ refunds: [refund], disputes: [dispute('won')] }),
    ])
    await handle.drop()
    handle = await makeTestDb()
    const made = await setupTradeWorld(handle.db)
    trade = await submittedTrade(handle.db, made.world)
    await setupPayments(handle.db, made.world.admin)
    const sequential = await paidAfter([
      processorState({ disputes: [dispute('open')] }),
      processorState({ refunds: [refund], disputes: [dispute('won')] }),
    ])
    expect(together).toBe(3529)
    expect(sequential).toBe(3529)
  })

  it('a refund that arrives while the dispute is open still reduces what is paid after the win', async () => {
    const paid = await paidAfter([
      processorState({ disputes: [dispute('open')] }),
      processorState({ refunds: [refund], disputes: [dispute('open')] }),
      processorState({ refunds: [refund], disputes: [dispute('won')] }),
    ])
    expect(paid).toBe(3529)
  })

  it('winning a dispute after the fee was paid in cash records the recovery as overpayment instead of failing', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    await reconcile(attemptId, processorState({ disputes: [dispute('lost')] }))
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(4500)
    const cash = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat',
        allocations: [lineAllocation(trade, 4500)],
      },
      signal,
      NOW,
    )
    expect(cash.ok).toBe(true)
    const won = await reconcile(attemptId, processorState({ disputes: [dispute('won')] }))
    expect(won.ok).toBe(true)
    const balance = await feeBalance(handle.db, trade.applicationId, signal)
    expect(balance.lines[0]).toMatchObject({ paidCents: 4500, dueCents: 0 })
    expect((await entries()).map((e) => e.entryType).sort()).toEqual([
      'chargeback',
      'correction',
      'payment',
      'payment',
    ])
  })
})

describe('finding 3: voiding a pending attempt', () => {
  it('cancels the processor object so a later capture cannot happen', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    await handle.db.update(paymentAttempts).set({ processorObjectId: 'pi_1' })
    fake.setState('pi_1', processorState({ status: 'pending' }))
    const finance = await staffActor(handle.db, 'finance')
    const voided = await voidAttempt(
      handle.db,
      finance,
      { attemptId, reason: 'Customer walked away' },
      signal,
      deps(),
    )
    expect(voided.ok).toBe(true)
    expect(fake.canceled).toEqual(['pi_1'])
  })

  it('a capture that still reaches a voided attempt is posted and flagged, never dropped', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    await handle.db.update(paymentAttempts).set({ processorObjectId: 'pi_1' })
    fake.setState('pi_1', processorState({ status: 'pending' }))
    const finance = await staffActor(handle.db, 'finance')
    await voidAttempt(
      handle.db,
      finance,
      { attemptId, reason: 'Customer walked away' },
      signal,
      deps(),
    )
    const late = await reconcile(attemptId, processorState())
    expect(late).toEqual({ ok: true, value: { state: 'captured', entriesPosted: 1 } })
    const [row] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
    expect(row?.anomaly).toBe('captured_after_voided')
  })
})

describe('finding 4: refunds the processor has not completed', () => {
  async function capturedCard() {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    await reconcile(attemptId, processorState())
    const [payment] = await entries()
    return { attemptId, entryId: payment?.id ?? '' }
  }

  it('a pending refund posts nothing yet and the later success posts it once with the stored allocations', async () => {
    const { attemptId, entryId } = await capturedCard()
    fake.refundStatus = 'pending'
    const finance = await staffActor(handle.db, 'finance')
    const r = await refundEntry(
      handle.db,
      finance,
      { entryId, amountCents: 1000, reason: 'Permit pulled in error' },
      signal,
      deps(),
    )
    expect(r).toMatchObject({
      ok: true,
      value: { pending: true, entryId: null, receiptNumber: null },
    })
    expect((await entries()).filter((e) => e.entryType === 'refund')).toHaveLength(0)
    expect(await handle.db.select().from(refundRequests)).toHaveLength(1)
    const done = await reconcile(
      attemptId,
      processorState({
        refunds: [{ objectId: 're_fake_1', amountCents: 1000, status: 'succeeded' }],
      }),
    )
    expect(done.ok && done.value.entriesPosted).toBe(1)
    expect((await entries()).filter((e) => e.entryType === 'refund')).toMatchObject([
      { amountCents: -1000 },
    ])
    expect(
      (await handle.db.select().from(receipts)).filter((x) => x.kind === 'refund'),
    ).toHaveLength(0)
  })

  it('a failed refund is an error and posts nothing', async () => {
    const { entryId } = await capturedCard()
    fake.refundStatus = 'failed'
    const finance = await staffActor(handle.db, 'finance')
    const r = await refundEntry(
      handle.db,
      finance,
      { entryId, amountCents: 1000, reason: 'Permit pulled in error' },
      signal,
      deps(),
    )
    expect(r).toMatchObject({ ok: false, error: { kind: 'rejected' } })
    expect((await entries()).filter((e) => e.entryType === 'refund')).toHaveLength(0)
  })
})

describe('finding 6: attempts that never learned a processor object id', () => {
  it('check with processor resolves the checkout and records the capture', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    await handle.db.update(paymentAttempts).set({ checkoutRef: 'cs_1' })
    fake.setCheckoutObject('cs_1', 'pi_1')
    fake.setState('pi_1', processorState())
    const finance = await staffActor(handle.db, 'finance')
    const checked = await checkWithProcessor(handle.db, finance, attemptId, signal, deps())
    expect(checked.ok && checked.value.state).toBe('captured')
    expect(await entries()).toHaveLength(1)
  })

  it('the hourly sweep resolves it too', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade)
    await handle.db
      .update(paymentAttempts)
      .set({ checkoutRef: 'cs_1', updatedAt: new Date('2027-03-02T10:00:00Z') })
    fake.setCheckoutObject('cs_1', 'pi_1')
    fake.setState('pi_1', processorState())
    const job = makePaymentsReconcileJob({ processorFactory: () => fake })
    await runJob(handle.db, job, { at: '2027-03-02T18:00:00.000Z' }, signal)
    const [row] = await handle.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId))
    expect(row).toMatchObject({ state: 'captured', processorObjectId: 'pi_1' })
  })

  it('finance can void an unknown reader attempt that has no object id, with a recorded reason', async () => {
    const { attemptId } = await makeCardAttempt(handle.db, trade, 'card_present')
    await handle.db.update(paymentAttempts).set({ outcomeUnknown: true, processorObjectId: null })
    const finance = await staffActor(handle.db, 'finance')
    const voided = await voidAttempt(
      handle.db,
      finance,
      { attemptId, reason: 'Checked the Clover dashboard: no sale' },
      signal,
      deps(),
    )
    expect(voided.ok).toBe(true)
  })
})

describe('finding 7: receipts follow ledger record access', () => {
  it('an inspector who is not a party cannot open a receipt', async () => {
    const paid = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat',
        allocations: [lineAllocation(trade, 4500)],
      },
      signal,
      NOW,
    )
    if (!paid.ok) throw new Error(paid.error)
    const [receipt] = await handle.db.select().from(receipts)
    const inspector = await staffActor(handle.db, 'inspector')
    expect((await receiptPdfResponse(handle.db, inspector, receipt?.id ?? '', signal)).status).toBe(
      403,
    )
    expect(
      (await receiptPdfResponse(handle.db, trade.world.staff, receipt?.id ?? '', signal)).status,
    ).toBe(200)
    const finance = await staffActor(handle.db, 'finance')
    expect((await receiptPdfResponse(handle.db, finance, receipt?.id ?? '', signal)).status).toBe(
      200,
    )
  })
})
