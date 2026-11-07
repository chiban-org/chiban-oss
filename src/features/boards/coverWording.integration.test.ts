import { describe, expect, it } from 'vitest'
import { packetCoverPdf } from '@/features/boards/cover'
import type { PacketView } from '@/features/boards/packetLinks'
import { profileFrame } from '@/test/frameFixtures'
import { pdfWording } from '@/test/pdfWording'
import type { CivilDate } from '@/types/civilDate'

const VIEW: PacketView = {
  packetId: 'packet-1',
  title: 'April meeting packet',
  boardId: '22222222-2222-4222-8222-222222222222',
  boardName: 'Zoning Board of Adjustment',
  boardShortName: 'Zoning Board of Adjustment',
  meetingDate: '2027-04-15' as CivilDate,
  expiresAt: '2027-05-15T00:00:00Z',
  items: [
    {
      versionId: 'v1',
      title: 'Application narrative',
      filename: 'narrative.pdf',
      mark: null,
      withdrawnOn: null,
      withdrawnWhy: null,
    },
    {
      versionId: 'v2',
      title: 'Site plan',
      filename: 'site-plan.pdf',
      mark: null,
      withdrawnOn: null,
      withdrawnWhy: null,
    },
  ],
}

describe('packet cover wording', () => {
  it('cover text', async () => {
    const pdf = await packetCoverPdf(VIEW, await profileFrame())
    expect(await pdfWording(pdf)).toMatchInlineSnapshot(`
      "Town of Alder Pond
      Land Use Office
      1 Main Street, Alder Pond, NH 03000
      Phone 603-555-0100  ·  landuse@alderpond.example

      April meeting packet

      Zoning Board of Adjustment, meeting April 15, 2027

      Contents

      Item
      Document

      1
      Application narrative
      2
      Site plan

      Page 1 of 1
      Keep this permit on site.

      "
    `)
  })
})
