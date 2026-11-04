import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { receipts } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { buildReceiptPdf } from '@/features/ledger/receiptPdf'
import { buildPermitPdf, buildPlacardPdf } from '@/features/permits/permitDocuments'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
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

const TEMPLATE = {
  key: 'el-permit',
  label: 'Electrical permit',
  kind: 'permit',
  body: 'Issued by the {{office.name}}, {{town.address}}. Questions: {{town.phone}}. Signed for the town by {{signer.building_official.name}}, {{signer.building_official.title}}.',
}

beforeEach(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  await saveAndPublish(handle.db, world.admin, 'template', 'el-permit', TEMPLATE)
  for (const [section, slice] of [
    [
      'profile',
      {
        officeName: 'Land Use Office',
        addressLines: ['1 Main Street', 'Alder Pond, NH 03000'],
        phone: '603-555-0100',
        email: 'landuse@alderpond.example',
        website: '',
        officeHours: '',
        logo: null,
      },
    ],
    [
      'signers',
      {
        signers: [
          {
            role: 'building_official',
            name: 'Ira Inspector',
            title: 'Building Official',
            signature: null,
          },
        ],
      },
    ],
  ] as const) {
    const published = await publishTownProfileSection(
      handle.db,
      world.admin,
      { section, slice },
      signal,
    )
    if (!published.ok) throw new Error(JSON.stringify(published.error))
  }
  trade = await submittedTrade(handle.db, world)
  const paid = await recordCounterPayment(
    handle.db,
    world.staff,
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
  expect((await tryIssue(handle.db, trade)).ok).toBe(true)
})
afterEach(async () => {
  await handle.drop()
})

describe('documents carry the town letterhead and signers', () => {
  it('the permit shows the letterhead, the new merge fields and the building official', async () => {
    const built = await buildPermitPdf(handle.db, trade.applicationId, signal)
    if (!built.ok) throw new Error(built.error)
    const text = (await pdfText(built.value)).replace(/\s+/g, ' ')
    expect(text).toContain('Land Use Office')
    expect(text).toContain('1 Main Street, Alder Pond, NH 03000')
    expect(text).toContain('Phone 603-555-0100')
    expect(text).toContain(
      'Issued by the Land Use Office, 1 Main Street, Alder Pond, NH 03000. Questions: 603-555-0100.',
    )
    expect(text).toContain('Signed for the town by Ira Inspector, Building Official.')
    expect(text).not.toContain('Authorized signature')
  })

  it('the placard keeps only the town name above the title', async () => {
    const built = await buildPlacardPdf(handle.db, trade.applicationId, signal)
    if (!built.ok) throw new Error(built.error)
    const text = await pdfText(built.value)
    expect(text).toContain('Town of Alder Pond')
    expect(text).not.toContain('Land Use Office')
  })

  it('the receipt carries the letterhead', async () => {
    const built = await buildReceiptPdf(handle.db, receiptId, signal)
    if (!built.ok) throw new Error(built.error)
    expect(await pdfText(built.value)).toContain('Land Use Office')
  })
})
