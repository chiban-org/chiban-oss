import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCounselPacket } from '@/features/enforcement/counselPacket'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  completeService,
  type EnforcementWorld,
  issuedOrder,
  setupEnforcementWorld,
  uploadProof,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'

const REAL_TODAY_ZONES = ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']

function maskRealToday(text: string): string {
  const now = new Date()
  const labels = new Set(
    REAL_TODAY_ZONES.map((timeZone) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(now),
    ),
  )
  return [...labels].reduce((acc, label) => acc.replaceAll(label, '<TODAY>'), text)
}

const signal = new AbortController().signal
const NOW = new Date('2027-07-20T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('counsel packet wording', () => {
  it('packet for a served order with proofs', async () => {
    const order = await issuedOrder(handle.db, store, world)
    await completeService(handle.db, store, world, order, '2027-03-01')
    await uploadProof(handle.db, store, world.staff, order.caseId, 'Affidavit of posting')
    const bytes = await buildCounselPacket(
      handle.db,
      order.caseId,
      '2027-07-20' as CivilDate,
      NOW,
      signal,
    )
    expect(maskRealToday(await pdfWording(bytes))).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Packet for town counsel

      EC-2027-0001

      Case
      EC-2027-0001

      Property
      14 Birch Lane

      Status
      Order issued

      Opened
      February 26, 2027

      Referred
      July 20, 2027

      Findings

      Provision
      Facts
      Inspected

      Zoning ordinance: Zoning
      Ordinance Section 4.2

      A garage was built without a
      permit.

      February 20, 2027

      Notice sent
      Received

      Order CD-2027-0001

      Status
      Served

      Authority
      RSA 676:17-a

      Issued
      February 26, 2027

      Corrective action due
      April 15, 2027

      Service checklist for CD-2027-0001

      Role
      Result
      Basis

      Taxpayer
      Same as the owner
      Tax bill goes to the owner
      Occupying tenant
      None exist
      Registry search on file
      Person in control of the property
      None exist
      Registry search on file
      Mortgagee of record
      None exist
      Registry search on file

      Recipient
      Role
      Source

      Pat Owner
      Owner of record
      CAMA owner

      Served
      Method
      Recipient
      Served by
      Proof

      March 1, 2027
      Handed to the
      recipient

      Pat Owner
      Sheriff Dale, Sheriff Return of service,

      <TODAY>

      Page 1 of 2


      Town of Alder Pond

      Pat Owner: answer due March 22, 2027 (moved from March 21, 2027). 20 calendar days after March 1,
      2027. Start day excluded, last day included (RSA 21:35 I). A last day on a Saturday, Sunday, or legal
      holiday moves to the next business day (RSA 21:35 II). If no answer is served, the enforcement official
      may move the district court to enforce the order.

      Proof of service on file
      Added

      Return of service
      <TODAY>
      Affidavit of posting
      <TODAY>

      Appeals and stays

      No appeals have been filed.

      Penalty exposure

      Authority
      RSA 676:17 I

      Accrual began
      Not started

      Days
      0

      Estimated exposure
      $0.00

      Estimated statutory exposure for counsel. Nothing is owed unless a court imposes it.

      Page 2 of 2

      "
    `)
  })
})
