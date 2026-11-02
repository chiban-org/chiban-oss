import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationConditions, receipts } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import { buildPermitPdf, buildPlacardPdf } from '@/features/permits/permitDocuments'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findRawKeys } from '@/test/leaks'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
  tryIssue,
} from '@/test/ledgerFixtures'
import { pdfText } from '@/test/pdfText'

const signal = new AbortController().signal
const NOON = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let trade: TradeFixture
let receiptId: string

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  const paid = await recordCounterPayment(
    handle.db,
    trade.world.staff,
    {
      method: 'cash',
      amountCents: 4500,
      payerName: 'Pat Smith',
      allocations: [lineAllocation(trade, 4500)],
    },
    signal,
    NOON,
  )
  if (!paid.ok) throw new Error(paid.error)
  const [receipt] = await handle.db
    .select({ id: receipts.id })
    .from(receipts)
    .where(eq(receipts.number, paid.value.receiptNumber))
  receiptId = receipt?.id ?? ''
  await handle.db.insert(applicationConditions).values({
    applicationId: trade.applicationId,
    code: 'SEPTIC',
    textSnapshot: 'Approved septic design on file',
    blocksIssuance: false,
    status: 'met',
    changedBy: trade.world.staff.userId,
  })
  expect((await tryIssue(handle.db, trade)).ok).toBe(true)
})
afterEach(async () => {
  await handle.drop()
})

describe('human-readable dates and labels in generated PDFs', () => {
  it('permit pdf lists conditions by text and prints no ISO date', async () => {
    const built = await buildPermitPdf(handle.db, trade.applicationId, signal)
    if (!built.ok) throw new Error(built.error)
    const text = await pdfText(built.value)
    expect(text).toContain('Approved septic design on file')
    expect(findRawKeys(text, ['SEPTIC'])).toEqual([])
    expect(findIsoDates(text)).toEqual([])
    expect(text).toMatch(/Issued\s*\n?\s*March \d+, 2027/)
  })

  it('placard prints no ISO date', async () => {
    const built = await buildPlacardPdf(handle.db, trade.applicationId, signal)
    if (!built.ok) throw new Error(built.error)
    expect(findIsoDates(await pdfText(built.value))).toEqual([])
  })

  it('receipt pdf prints the business date in words', async () => {
    const built = await buildReceiptPdf(handle.db, receiptId, signal)
    if (!built.ok) throw new Error(built.error)
    const text = await pdfText(built.value)
    expect(findIsoDates(text)).toEqual([])
    expect(text).toContain('March 2, 2027')
  })
})
