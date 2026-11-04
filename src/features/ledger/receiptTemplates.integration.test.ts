import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries, receipts } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import { refundEntry } from '@/features/ledger/reversals'
import { RECEIPT_SOURCE } from '@/features/templates/preview/officeSources'
import { renderDocument } from '@/features/templates/templateBlocks'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import { publishWordingTemplate, TOWN_WORDING } from '@/test/wordingTemplate'

const signal = new AbortController().signal
const NOON = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let trade: TradeFixture
let paymentReceiptId: string
let refundReceiptId: string

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
      tenderedCents: 5000,
      payerName: 'Zoe Lukasz',
      allocations: [lineAllocation(trade, 4500)],
    },
    signal,
    NOON,
  )
  if (!paid.ok) throw new Error(paid.error)
  const [entry] = await handle.db.select().from(ledgerEntries)
  const refunded = await refundEntry(
    handle.db,
    await staffActor(handle.db, 'finance'),
    { entryId: entry?.id ?? '', amountCents: 1000, reason: 'Fee charged in error' },
    signal,
    { now: new Date('2027-03-03T17:00:00Z') },
  )
  if (!refunded.ok) throw new Error(JSON.stringify(refunded.error))
  const rows = await handle.db.select().from(receipts)
  paymentReceiptId = rows.find((r) => r.kind === 'payment')?.id ?? ''
  refundReceiptId = rows.find((r) => r.kind === 'refund')?.id ?? ''
})
afterEach(async () => {
  await handle.drop()
})

async function realText(receiptId: string): Promise<string> {
  const built = await buildReceiptPdf(handle.db, receiptId, signal)
  if (!built.ok) throw new Error(built.error)
  return await pdfText(built.value)
}

describe('receipt templates', () => {
  it('a published template is used and a refund keeps its own title', async () => {
    await publishWordingTemplate(handle.db, await staffActor(handle.db, 'admin'), 'receipt')
    const payment = await realText(paymentReceiptId)
    expect(payment).toContain(TOWN_WORDING)
    expect(payment).toContain('Zoe Lukasz')
    const refund = await realText(refundReceiptId)
    expect(refund).toContain(TOWN_WORDING)
    expect(refund).toContain('Refund receipt')
  })

  it('the preview lists both receipts and rebuilds the real documents', async () => {
    const scope = { db: handle.db, actor: trade.world.staff, signal }
    const samples = await RECEIPT_SOURCE.samples(scope)
    expect(samples.map((s) => s.label).sort()).toEqual([
      'R-2027-000001, payment on March 2, 2027',
      'R-2027-000002, refund on March 3, 2027',
    ])
    for (const id of [paymentReceiptId, refundReceiptId]) {
      const input = await RECEIPT_SOURCE.input(scope, id)
      if (input === null) throw new Error('no preview input')
      const rendered = await renderDocument('receipt', null, input)
      if (!rendered.ok) throw new Error('render failed')
      expect(await pdfText(rendered.value)).toBe(await realText(id))
    }
  })
})
