import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ledgerEntries } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { portalReceiptPdfResponse } from '@/features/portal/receiptAccess'
import { createProject } from '@/features/projects/projects'
import { makeTestDb, type TestDb } from '@/test/db'
import { lineAllocation, setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

describe('a shared counter receipt is scoped to the requested application', () => {
  it('the applicant of A cannot fetch the receipt under B', async () => {
    const { world: w } = await setupTradeWorld(handle.db)
    const a = await submittedTrade(handle.db, w)
    const other = await staffActor(handle.db, 'applicant')
    const project = await createProject(
      handle.db,
      other,
      { parcelId: w.parcelId, title: 'Other' },
      signal,
    )
    if (!project.ok) throw new Error('project')
    const b = await submittedTrade(
      handle.db,
      w,
      new Date('2027-03-02T15:00:00Z'),
      project.value.projectId,
    )
    const paid = await recordCounterPayment(
      handle.db,
      w.staff,
      {
        method: 'cash',
        amountCents: 9000,
        payerName: 'Pat',
        allocations: [lineAllocation(a, 4500), lineAllocation(b, 4500)],
      },
      signal,
      new Date('2027-03-02T17:00:00Z'),
    )
    if (!paid.ok) throw new Error(paid.error)
    const [entry] = await handle.db
      .select({ receipt_id: ledgerEntries.receiptId })
      .from(ledgerEntries)
    const receiptId = entry?.receipt_id ?? ''
    const own = await portalReceiptPdfResponse(
      handle.db,
      w.applicant,
      { applicationId: a.applicationId, receiptId },
      signal,
    )
    const foreign = await portalReceiptPdfResponse(
      handle.db,
      w.applicant,
      { applicationId: b.applicationId, receiptId },
      signal,
    )
    expect(own.status).toBe(200)
    expect(foreign.status).toBe(404)
  })
})
