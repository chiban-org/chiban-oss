import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries, receipts } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import { refundEntry } from '@/features/ledger/reversals'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { pdfWording } from '@/test/pdfWording'

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

async function receiptWording(where: { number: string } | { kind: 'refund' }) {
  const [row] = await handle.db
    .select()
    .from(receipts)
    .where('number' in where ? eq(receipts.number, where.number) : eq(receipts.kind, where.kind))
  const built = await buildReceiptPdf(handle.db, row?.id ?? '', signal)
  if (!built.ok) throw new Error(built.error)
  return await pdfWording(built.value)
}

describe('receipt wording', () => {
  it('cash payment with tendered and change, then a refund receipt', async () => {
    const paid = await recordCounterPayment(
      handle.db,
      trade.world.staff,
      {
        method: 'cash',
        amountCents: 4500,
        tenderedCents: 5000,
        payerName: 'Zoë Łukasz-Ngũgĩ',
        allocations: [lineAllocation(trade, 4500)],
      },
      signal,
      NOON,
    )
    if (!paid.ok) throw new Error(paid.error)
    expect(await receiptWording({ number: paid.value.receiptNumber })).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Payment receipt

      R-2027-000001

      Receipt
      R-2027-000001

      Date
      March 2, 2027

      Received from
      Zoë Łukasz-Ngũgĩ

      Method
      Cash

      Total received
      $45.00

      Tendered
      $50.00

      Change
      $5.00

      Application
      Fee
      Amount

      EL-2027-0001
      Electrical permit fee
      $45.00

      Page 1 of 1

      "
    `)
    const [entry] = await handle.db.select().from(ledgerEntries)
    const refunded = await refundEntry(
      handle.db,
      await staffActor(handle.db, 'finance'),
      { entryId: entry?.id ?? '', amountCents: 1000, reason: 'Fee charged in error' },
      signal,
      { now: new Date('2027-03-03T17:00:00Z') },
    )
    if (!refunded.ok) throw new Error(JSON.stringify(refunded.error))
    expect(await receiptWording({ kind: 'refund' })).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Refund receipt

      R-2027-000002

      Receipt
      R-2027-000002

      Date
      March 3, 2027

      Refunded to
      Zoë Łukasz-Ngũgĩ

      Method
      Cash

      Total refunded
      $10.00

      Application
      Fee
      Amount

      EL-2027-0001
      Electrical permit fee
      -$10.00

      Page 1 of 1

      "
    `)
  })
})
