import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { fineBalance, recordFine } from '@/features/enforcement/fines'
import { refundEntry } from '@/features/ledger/reversals'
import { loadCasePayments } from '@/features/payments/casePayments'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  judgmentFor,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-07-20T15:00:00Z')
const REASON = 'Paid twice at the counter'
let handle: TestDb
let world: EnforcementWorld
let order: IssuedOrder
let fineA = ''
let fineB = ''
let entryId = ''

async function fine(judgmentStepId: string, amountCents: number): Promise<string> {
  const recorded = await recordFine(
    handle.db,
    world.finance,
    {
      caseId: order.caseId,
      orderId: order.orderId,
      kind: 'civil_penalty',
      ruleKey: 'nh.enf.penalty_zoning',
      amountCents,
      imposedOn: '2027-06-18',
      court: 'District Court, Alder Pond Division',
      docket: '2027-CV-0042',
      judgmentStepId,
    },
    signal,
    NOW,
  )
  if (!recorded.ok) throw new Error(recorded.error)
  return recorded.value.fineId
}

beforeEach(async () => {
  handle = await makeTestDb()
  const { store } = await makeTestStore()
  world = await setupEnforcementWorld(handle.db)
  order = await issuedOrder(handle.db, store, world)
  const step = await judgmentFor(handle.db, store, world, order)
  fineA = await fine(step, 20000)
  fineB = await fine(step, 10000)
  const paid = await recordCounterPayment(
    handle.db,
    world.finance,
    {
      method: 'cash',
      amountCents: 15000,
      payerName: 'Pat Owner',
      allocations: [
        { targetKind: 'fine', fineId: fineA, amountCents: 10000 },
        { targetKind: 'fine', fineId: fineB, amountCents: 5000 },
      ],
    },
    signal,
    NOW,
  )
  if (!paid.ok) throw new Error(paid.error)
  entryId = paid.value.entryId
})
afterEach(async () => {
  await handle.drop()
})

describe('payments on an enforcement case', () => {
  it('lists each payment under the fine it paid, with what is left to refund on that fine', async () => {
    const payments = await loadCasePayments(handle.db, world.finance, [fineA, fineB], signal)
    expect(payments?.canRefund).toBe(true)
    expect(payments?.byFine.get(fineA)).toMatchObject([
      {
        id: entryId,
        entryType: 'payment',
        method: 'cash',
        amountCents: 15000,
        refundableCents: 10000,
      },
    ])
    expect(payments?.byFine.get(fineB)).toMatchObject([{ id: entryId, refundableCents: 5000 }])
  })

  it('staff who can take payments see them but get no refund controls', async () => {
    const payments = await loadCasePayments(handle.db, world.staff, [fineA], signal)
    expect(payments?.canRefund).toBe(false)
    expect(payments?.byFine.get(fineA)).toHaveLength(1)
  })

  it('someone without any payment permission gets nothing', async () => {
    expect(await loadCasePayments(handle.db, world.inspector, [fineA], signal)).toBeNull()
  })

  it('a refund from one fine reduces only that fine', async () => {
    const refunded = await refundEntry(
      handle.db,
      world.finance,
      { entryId, amountCents: 4000, reason: REASON, fineId: fineA },
      signal,
      { now: NOW },
    )
    expect(refunded.ok).toBe(true)
    expect((await fineBalance(handle.db, fineA, signal)).paidCents).toBe(6000)
    expect((await fineBalance(handle.db, fineB, signal)).paidCents).toBe(5000)
    const payments = await loadCasePayments(handle.db, world.finance, [fineA, fineB], signal)
    expect(payments?.byFine.get(fineA)?.find((e) => e.id === entryId)?.refundableCents).toBe(6000)
  })

  it('a refund larger than what is left on the fine is refused', async () => {
    const refunded = await refundEntry(
      handle.db,
      world.finance,
      { entryId, amountCents: 12000, reason: REASON, fineId: fineA },
      signal,
      { now: NOW },
    )
    expect(refunded).toEqual({ ok: false, error: 'over_reversed' })
  })
})
