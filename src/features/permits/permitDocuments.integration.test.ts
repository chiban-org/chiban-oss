import { eq } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries, receipts } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { receiptPdfResponse } from '@/features/ledger/receiptAccess'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import { refundEntry } from '@/features/ledger/reversals'
import { resolveDevCheckout } from '@/features/payments/simulatedCheckout'
import { startOnlinePayment } from '@/features/payments/startPayment'
import { permitPdfResponse } from '@/features/permits/permitAccess'
import { buildPermitPdf, buildPlacardPdf } from '@/features/permits/permitDocuments'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
  tryIssue,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'
import { pdfText } from '@/test/pdfText'

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

async function payCashAndIssue() {
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
  expect((await tryIssue(handle.db, trade)).ok).toBe(true)
  return paid.value.receiptNumber
}

describe('permit and placard documents', () => {
  it('permit pdf for an issued trade permit contains the number EL-2027-0001', async () => {
    await payCashAndIssue()
    const built = await buildPermitPdf(handle.db, trade.applicationId, signal)
    if (!built.ok) throw new Error(built.error)
    const text = await pdfText(built.value)
    expect(text).toContain('EL-2027-0001')
    expect(text).toContain('Electrical Permit EL-2027-0001')
    expect(text).toContain('Parcel 007001000000')
    expect(text).toContain('Contractor')
    expect(text).toContain('Not applicable')
  })

  it('the permit says whether its fees are paid', async () => {
    await payCashAndIssue()
    const paid = await buildPermitPdf(handle.db, trade.applicationId, signal)
    if (!paid.ok) throw new Error(paid.error)
    expect(await pdfText(paid.value)).toContain('$45.00, paid in full')
    const [entry] = await handle.db.select().from(ledgerEntries)
    const refunded = await refundEntry(
      handle.db,
      await staffActor(handle.db, 'finance'),
      { entryId: entry?.id ?? '', amountCents: 1000, reason: 'Fee charged in error' },
      signal,
    )
    if (!refunded.ok) throw new Error(JSON.stringify(refunded.error))
    const owing = await buildPermitPdf(handle.db, trade.applicationId, signal)
    if (!owing.ok) throw new Error(owing.error)
    expect(await pdfText(owing.value)).toContain('$45.00, $10.00 not yet paid')
  })

  it('permit for an application that is not issued is not_issued', async () => {
    expect(await buildPermitPdf(handle.db, trade.applicationId, signal)).toEqual({
      ok: false,
      error: 'not_issued',
    })
    expect(await buildPlacardPdf(handle.db, trade.applicationId, signal)).toEqual({
      ok: false,
      error: 'not_issued',
    })
  })

  it('placard has one page and the posting notice', async () => {
    await payCashAndIssue()
    const built = await buildPlacardPdf(handle.db, trade.applicationId, signal)
    if (!built.ok) throw new Error(built.error)
    expect((await PDFDocument.load(built.value)).getPageCount()).toBe(1)
    const text = await pdfText(built.value)
    expect(text).toContain('ELECTRICAL PERMIT')
    expect(text.replace(/\s+/g, ' ')).toContain(
      'Post this placard where it can be seen from the street until the final inspection.',
    )
  })
})

describe('permit routes', () => {
  it('permit and placard responses are 403 for an applicant or a reviewer and 404 until issued', async () => {
    const input = { applicationId: trade.applicationId, document: 'permit' as const }
    for (const actor of [trade.world.applicant, trade.world.reviewer, null]) {
      expect((await permitPdfResponse(handle.db, actor, input, signal)).status).toBe(403)
    }
    expect((await permitPdfResponse(handle.db, trade.world.staff, input, signal)).status).toBe(404)
    await payCashAndIssue()
    const permit = await permitPdfResponse(handle.db, trade.world.staff, input, signal)
    const placard = await permitPdfResponse(
      handle.db,
      trade.world.staff,
      { ...input, document: 'placard' },
      signal,
    )
    expect([permit.status, placard.status]).toEqual([200, 200])
    expect(permit.contentType).toBe('application/pdf')
  })

  it('an application id that is not a uuid is 404', async () => {
    const r = await permitPdfResponse(
      handle.db,
      trade.world.staff,
      { applicationId: 'x', document: 'permit' },
      signal,
    )
    expect(r.status).toBe(404)
  })
})

describe('receipt documents', () => {
  it('a cash receipt lists the fee line, tendered, and change', async () => {
    const number = await payCashAndIssue()
    const [row] = await handle.db.select().from(receipts).where(eq(receipts.number, number))
    const built = await buildReceiptPdf(handle.db, row?.id ?? '', signal)
    if (!built.ok) throw new Error(built.error)
    const text = await pdfText(built.value)
    expect(text).toContain(number)
    expect(text).toContain('EL-2027-0001')
    expect(text).toContain('$45.00')
    expect(text).toContain('$50.00')
    expect(text).toContain('$5.00')
    expect(text).toContain('Cash')
  })

  it('name outside WinAnsi renders without throwing on the receipt', async () => {
    const number = await payCashAndIssue()
    const [row] = await handle.db.select().from(receipts).where(eq(receipts.number, number))
    const built = await buildReceiptPdf(handle.db, row?.id ?? '', signal)
    expect(built.ok && (await pdfText(built.value))).toContain('Zoë Lukasz-Ngugi')
  })

  it('simulated receipt contains SIMULATED', async () => {
    await setupPayments(handle.db, trade.world.admin, 'simulated', 'sim_town')
    const started = await startOnlinePayment(
      handle.db,
      trade.world.applicant,
      { applicationIds: [trade.applicationId], payerName: 'Alex Applicant' },
      signal,
      { now: NOON },
    )
    if (!started.ok) throw new Error(JSON.stringify(started.error))
    const objectId = started.value.redirectUrl.split('/').at(-1) ?? ''
    await resolveDevCheckout(handle.db, objectId, 'approve', signal, { now: NOON, enabled: true })
    const [row] = await handle.db.select().from(receipts)
    const built = await buildReceiptPdf(handle.db, row?.id ?? '', signal)
    if (!built.ok) throw new Error(built.error)
    const text = await pdfText(built.value)
    expect(text).toContain('SIMULATED: no card was charged.')
    expect(text).toContain('Convenience fee')
  })

  it('an unknown receipt is not_found', async () => {
    expect(
      await buildReceiptPdf(handle.db, '00000000-0000-4000-8000-000000000000', signal),
    ).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('receipt route as an applicant is 403', async () => {
    await payCashAndIssue()
    const [row] = await handle.db.select().from(receipts)
    const denied = await receiptPdfResponse(handle.db, trade.world.applicant, row?.id ?? '', signal)
    expect(denied.status).toBe(403)
    const reviewer = await receiptPdfResponse(
      handle.db,
      trade.world.reviewer,
      row?.id ?? '',
      signal,
    )
    expect(reviewer.status).toBe(403)
    const missing = await receiptPdfResponse(handle.db, null, row?.id ?? '', signal)
    expect(missing.status).toBe(403)
    const allowed = await receiptPdfResponse(handle.db, trade.world.staff, row?.id ?? '', signal)
    expect(allowed.status).toBe(200)
    expect(allowed.contentType).toBe('application/pdf')
  })
})
