import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationConditions, clocks } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { adoptStarter } from '@/features/config/adoptStarter'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { buildPermitPdf, buildPlacardPdf } from '@/features/permits/permitDocuments'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { formatCivilDate } from '@/lib/formatDate'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
  tryIssue,
} from '@/test/ledgerFixtures'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOON = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let trade: TradeFixture
let world: PermitWorld

const TEMPLATE = {
  key: 'el-permit',
  label: 'Electrical permit',
  kind: 'permit',
  body: 'Permit {{application.number}} is issued by the {{office.name}}, {{town.address}}, for work at {{parcel.siteAddress}}.\n\nQuestions: {{town.phone}}. Signed for the town by {{signer.building_official.name}}, {{signer.building_official.title}}.',
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
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
  await handle.db.insert(applicationConditions).values({
    applicationId: trade.applicationId,
    code: 'SEPTIC',
    textSnapshot: 'Approved septic design on file',
    blocksIssuance: false,
    status: 'met',
    changedBy: world.staff.userId,
  })
  expect((await tryIssue(handle.db, trade)).ok).toBe(true)
})
afterEach(async () => {
  await handle.drop()
})

describe('permit and placard wording', () => {
  it('permit text', async () => {
    const built = await buildPermitPdf(handle.db, trade.applicationId, signal)
    if (!built.ok) throw new Error(built.error)
    expect(await pdfWording(built.value)).toMatchInlineSnapshot(`
      "Town of Alder Pond
      Land Use Office
      1 Main Street, Alder Pond, NH 03000
      Phone 603-555-0100  ·  landuse@alderpond.example

      Electrical permit

      EL-2027-0001

      Permit EL-2027-0001 is issued by the Land Use Office, 1 Main Street, Alder Pond, NH 03000, for work
      at Not recorded.

      Questions: 603-555-0100. Signed for the town by Ira Inspector, Building Official.

      Number
      EL-2027-0001

      Type
      Electrical permit

      Parcel
      007001000000

      Site address

      Owner

      Contractor
      (license EL-1)

      Issued
      March 10, 2027

      Expires
      Not applicable

      Fees
      $45.00, paid in full

      Conditions

      Condition

      Approved septic design on file

      Ira Inspector
      Building Official

      Page 1 of 1

      "
    `)
  })

  it('placard text', async () => {
    const built = await buildPlacardPdf(handle.db, trade.applicationId, signal)
    if (!built.ok) throw new Error(built.error)
    expect(await pdfWording(built.value)).toMatchInlineSnapshot(`
      "Town of Alder Pond
      ELECTRICAL PERMIT

      Number
      EL-2027-0001

      Site address

      Contractor

      Issued
      March 10, 2027

      Expires
      Not applicable

      Post this placard where it can be seen from the street until the
      final inspection.

      "
    `)
  })
})

async function issuedLocalPermit(starter: string, typeKey: string): Promise<string> {
  const adopted = await adoptStarter(handle.db, world.admin, starter, signal)
  if (!adopted.ok) throw new Error(JSON.stringify(adopted.error))
  const issuedOn = '2027-03-10' as CivilDate
  const made = await makeApplication(handle.db, world, { state: 'issued', issuedOn }, NOON, typeKey)
  await handle.db.transaction((tx) =>
    startClocksFor(tx, made.applicationId, 'permit_issued', issuedOn, signal),
  )
  return made.applicationId
}

async function clockDue(applicationId: string, ruleKey: string): Promise<string> {
  const [clock] = await handle.db
    .select({ due: clocks.currentDue })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, ruleKey),
        isNull(clocks.supersededBy),
      ),
    )
  if (clock === undefined) throw new Error(`no ${ruleKey} clock`)
  return formatCivilDate(clock.due)
}

describe('the expiry date on registrations and temporary permits', () => {
  for (const [starter, typeKey, ruleKey] of [
    ['nh.starter.alarm_registration', 'AR', 'town.registration.expiration'],
    ['nh.starter.temporary_structure', 'TS', 'town.temporary.expiration'],
  ] as const) {
    it(`${typeKey} prints its ${ruleKey} date`, async () => {
      const applicationId = await issuedLocalPermit(starter, typeKey)
      const due = await clockDue(applicationId, ruleKey)
      const built = await buildPermitPdf(handle.db, applicationId, signal)
      if (!built.ok) throw new Error(built.error)
      const lines = (await pdfWording(built.value)).split('\n')
      expect(lines[lines.indexOf('Expires') + 1]).toBe(due)
      expect(lines).not.toContain('Not applicable')
      expect(lines).not.toContain('Code edition')
    })
  }
})
