import { describe, expect, it } from 'vitest'
import { type AgendaModel, renderAgendaPdf } from '@/features/agendas/agendaPdf'
import { profileFrame } from '@/test/frameFixtures'
import { pdfWording } from '@/test/pdfWording'

const MODEL: AgendaModel = {
  boardName: 'Zoning Board of Adjustment',
  meetingDate: 'April 15, 2027',
  location: '',
  time: '7:00 PM',
  items: [
    {
      position: 0,
      kind: 'hearing',
      title: 'Variance hearing',
      description: '',
      application: {
        number: 'VAR-2027-0001',
        applicantName: '',
        parcelDisplayId: '007001000000',
        siteAddress: '12 Pond Road',
      },
    },
    {
      position: 1,
      kind: 'business',
      title: 'Review of rules of procedure',
      description: '  Discuss the proposed change to the filing deadline.  ',
      application: null,
    },
    {
      position: 2,
      kind: 'minutes_approval',
      title: 'Approve minutes',
      description: '',
      application: null,
    },
  ],
}

describe('agenda wording', () => {
  it('agenda text', async () => {
    const pdf = await renderAgendaPdf(await profileFrame(), MODEL)
    expect(await pdfWording(pdf)).toMatchInlineSnapshot(`
      "Town of Alder Pond
      Land Use Office
      1 Main Street, Alder Pond, NH 03000
      Phone 603-555-0100  ·  landuse@alderpond.example

      Meeting agenda

      April 15, 2027

      Board
      Zoning Board of Adjustment

      Date
      April 15, 2027

      Time
      7:00 PM

      Location
      Not recorded

      Items

      Item
      Application
      Applicant
      Parcel
      Site address

      1. Variance hearing VAR-2027-0001
      Not recorded
      007001000000
      12 Pond Road
      2. Review of rules
      of procedure
      3. Approve minutes

      Item 2 details: Discuss the proposed change to the filing deadline.

      Page 1 of 1
      Keep this permit on site.

      "
    `)
  })
})
