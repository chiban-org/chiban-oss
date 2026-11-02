import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, ledgerEntries, receipts } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { feeBalance } from '@/features/ledger/feeBalance'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'

const signal = new AbortController().signal
const NOON = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let trade: TradeFixture

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

function cash(amountCents: number, tenderedCents?: number) {
  return {
    method: 'cash' as const,
    amountCents,
    tenderedCents,
    payerName: 'Pat Contractor',
    allocations: [lineAllocation(trade, amountCents)],
  }
}

describe('recordCounterPayment', () => {
  it('cash 4500 tendered 5000 gives change 500 and receipt R-2027-000001', async () => {
    const r = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      cash(4500, 5000),
      signal,
      NOON,
    )
    expect(r.ok && r.value).toMatchObject({ changeCents: 500, receiptNumber: 'R-2027-000001' })
    const [receipt] = await handle.db.select().from(receipts)
    expect(receipt).toMatchObject({ totalCents: 4500, tenderedCents: 5000, changeCents: 500 })
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(0)
  })

  it('second receipt is R-2027-000002 and numbering restarts on 2028-01-01 in the town time zone', async () => {
    const second = await submittedTrade(handle.db, trade.world)
    const first = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      cash(4500, 4500),
      signal,
      NOON,
    )
    const next = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'check',
        amountCents: 4500,
        checkNumber: '1001',
        payerName: 'Pat Contractor',
        allocations: [lineAllocation(second, 4500)],
      },
      signal,
      NOON,
    )
    expect(first.ok && first.value.receiptNumber).toBe('R-2027-000001')
    expect(next.ok && next.value.receiptNumber).toBe('R-2027-000002')
    const third = await submittedTrade(handle.db, trade.world)
    const newYear = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat Contractor',
        allocations: [lineAllocation(third, 4500)],
      },
      signal,
      new Date('2028-01-01T04:30:00Z'),
    )
    expect(newYear.ok && newYear.value.receiptNumber).toBe('R-2027-000003')
    const fourth = await submittedTrade(handle.db, trade.world)
    const restarted = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        payerName: 'Pat Contractor',
        allocations: [lineAllocation(fourth, 4500)],
      },
      signal,
      new Date('2028-01-01T05:30:00Z'),
    )
    expect(restarted.ok && restarted.value.receiptNumber).toBe('R-2028-000001')
  })

  it('cash tendered 4000 for 4500 is tendered_short', async () => {
    const r = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      cash(4500, 4000),
      signal,
      NOON,
    )
    expect(r).toEqual({ ok: false, error: 'tendered_short' })
  })

  it('check without a number is check_number_required', async () => {
    const r = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      { ...cash(4500), method: 'check' },
      signal,
      NOON,
    )
    expect(r).toEqual({ ok: false, error: 'check_number_required' })
  })

  it('check records the number and gives no change', async () => {
    const r = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      { ...cash(4500), method: 'check', checkNumber: '2044' },
      signal,
      NOON,
    )
    expect(r.ok && r.value.changeCents).toBe(0)
    const [entry] = await handle.db.select().from(ledgerEntries)
    expect(entry).toMatchObject({ method: 'check', checkNumber: '2044' })
  })

  it('cash 9000 against 4500 due is over_allocated and writes no receipt', async () => {
    const r = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      cash(9000, 9000),
      signal,
      NOON,
    )
    expect(r).toEqual({ ok: false, error: 'over_allocated' })
    expect(await handle.db.select().from(receipts)).toHaveLength(0)
    expect(await handle.db.select().from(ledgerEntries)).toHaveLength(0)
  })

  it('allocations that do not sum to the amount are amount_mismatch', async () => {
    const r = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      { ...cash(4500, 4500), allocations: [lineAllocation(trade, 4000)] },
      signal,
      NOON,
    )
    expect(r).toEqual({ ok: false, error: 'amount_mismatch' })
  })

  it('one cash payment allocated across two applications updates both balances', async () => {
    const other = await submittedTrade(handle.db, trade.world)
    const r = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'cash',
        amountCents: 9000,
        tenderedCents: 10000,
        payerName: 'Pat Contractor',
        allocations: [lineAllocation(trade, 4500), lineAllocation(other, 4500)],
      },
      signal,
      NOON,
    )
    expect(r.ok && r.value.changeCents).toBe(1000)
    expect((await feeBalance(handle.db, trade.applicationId, signal)).dueCents).toBe(0)
    expect((await feeBalance(handle.db, other.applicationId, signal)).dueCents).toBe(0)
  })

  it('reviewer recording a payment is forbidden', async () => {
    const r = await recordCounterPayment(
      handle.db,
      trade.world.reviewer,
      cash(4500, 4500),
      signal,
      NOON,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('every counter payment writes an audit row', async () => {
    const r = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      cash(4500, 4500),
      signal,
      NOON,
    )
    if (!r.ok) throw new Error('payment failed')
    const rows = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, r.value.entryId))
    expect(rows).toMatchObject([
      { action: 'payment.counter', actorUserId: trade.world.staff.userId },
    ])
  })

  it('a receipt cannot be updated', async () => {
    await recordCounterPayment(handle.db, trade.world.staff, cash(4500, 4500), signal, NOON)
    await expectDbError(handle.db.update(receipts).set({ totalCents: 1 }), /E_PAY_001/)
  })
})
