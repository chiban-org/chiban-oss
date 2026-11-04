import type { CeaseAndDesistRule } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import type { violationFindings } from '@/db/schema'
import { renderOrderPdf } from '@/features/enforcement/orderPdf'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { profileFrame } from '@/test/frameFixtures'
import { pdfWording } from '@/test/pdfWording'

type Finding = typeof violationFindings.$inferSelect

function zoningRule(): CeaseAndDesistRule {
  const rule = ruleByKey(loadPack(), 'nh.enf.cd_zoning')
  if (rule.kind !== 'cease_and_desist') throw new Error('not a cease and desist rule')
  return rule
}

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    caseId: '00000000-0000-4000-8000-000000000002',
    provisionKind: 'zoning_ordinance',
    provisionRef: 'Section 4.2 setback',
    facts: 'A shed stands four feet from the side lot line.',
    inspectionDate: '2027-02-10',
    foundOn: '2027-02-10',
    foundBy: '00000000-0000-4000-8000-000000000003',
    status: 'open',
    ...overrides,
  }
}

const FINDINGS = [
  finding({}),
  finding({
    id: '00000000-0000-4000-8000-000000000004',
    provisionKind: 'building_code',
    provisionRef: 'IBC 105.1 permit required',
    facts: 'Electrical work is under way with no permit.',
    inspectionDate: '2027-02-17',
  }),
]

const BASE = {
  number: 'CD-2027-0001',
  locationText: '12 Pond Road, parcel 007001000000',
  findings: FINDINGS,
  correctiveAction: 'Remove the shed or move it to a compliant location.',
  correctiveDeadline: '2027-03-15',
  issuedOn: '2027-02-26',
  issuerName: 'Ira Inspector',
  issuerTitle: 'Code Enforcement Officer',
}

describe('cease and desist order wording', () => {
  it('order with every content field and an immediate cease', async () => {
    const pdf = await renderOrderPdf({
      ...BASE,
      frame: await profileFrame(),
      rule: zoningRule(),
      ceaseImmediately: true,
    })
    expect(await pdfWording(pdf)).toMatchInlineSnapshot(`
      "Town of Alder Pond
      Land Use Office
      1 Main Street, Alder Pond, NH 03000
      Phone 603-555-0100  ·  landuse@alderpond.example

      Cease and desist order

      CD-2027-0001

      Order number
      CD-2027-0001

      Property
      12 Pond Road, parcel 007001000000

      Issued
      February 26, 2027

      Authority
      RSA 676:17-a

      You must cease the activity described in this order immediately.

      Provisions violated

      Zoning ordinance: Section 4.2 setback

      Building code: IBC 105.1 permit required

      Facts

      A shed stands four feet from the side lot line.

      Electrical work is under way with no permit.

      Date of inspection

      February 10, 2027

      February 17, 2027

      Corrective action required

      Remove the shed or move it to a compliant location.

      Corrective action due

      March 15, 2027

      Notice of motion to enforce

      Unless the corrective action is taken within the time this order provides, or an answer is filed within 20
      days of service, a motion for summary enforcement of this order will be made to the district court for the
      place where the property is located.

      Page 1 of 2
      Keep this permit on site.


      Town of Alder Pond
      Land Use Office
      1 Main Street, Alder Pond, NH 03000
      Phone 603-555-0100  ·  landuse@alderpond.example

      Lien warning

      If you do not take the corrective action or file an answer, the town may take the corrective action itself.
      Its costs become a lien on the property, enforceable like real estate taxes, and may lead to loss of the
      property if not paid.

      Ira Inspector
      Code Enforcement Officer

      Page 2 of 2
      Keep this permit on site.

      "
    `)
  })

  it('order with only some content fields and no immediate cease', async () => {
    const pdf = await renderOrderPdf({
      ...BASE,
      frame: await profileFrame(),
      rule: { ...zoningRule(), contentFields: ['provisions', 'correctiveAction', 'lienWarning'] },
      ceaseImmediately: false,
    })
    expect(await pdfWording(pdf)).toMatchInlineSnapshot(`
      "Town of Alder Pond
      Land Use Office
      1 Main Street, Alder Pond, NH 03000
      Phone 603-555-0100  ·  landuse@alderpond.example

      Cease and desist order

      CD-2027-0001

      Order number
      CD-2027-0001

      Property
      12 Pond Road, parcel 007001000000

      Issued
      February 26, 2027

      Authority
      RSA 676:17-a

      Provisions violated

      Zoning ordinance: Section 4.2 setback

      Building code: IBC 105.1 permit required

      Corrective action required

      Remove the shed or move it to a compliant location.

      Lien warning

      If you do not take the corrective action or file an answer, the town may take the corrective action itself.
      Its costs become a lien on the property, enforceable like real estate taxes, and may lead to loss of the
      property if not paid.

      Ira Inspector
      Code Enforcement Officer

      Page 1 of 1
      Keep this permit on site.

      "
    `)
  })
})
