import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applicationConditions } from '@/db/schema'
import { buildCertificatePdf } from '@/features/certificates/certificatePdf'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  civil,
  type InspectionWorld,
  newIssuedPermit,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { pdfWording } from '@/test/pdfWording'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('certificate of occupancy wording', () => {
  it('certificate text', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    await handle.db.insert(applicationConditions).values({
      applicationId: permit.applicationId,
      code: 'SEPTIC',
      textSnapshot: 'Approved septic design on file',
      blocksIssuance: false,
      status: 'met',
      changedBy: w.world.staff.userId,
    })
    const bytes = await buildCertificatePdf(
      handle.db,
      permit.applicationId,
      {
        number: 'CO-2027-0001',
        issuedOn: civil('2027-07-07'),
        finalInspectionOn: civil('2027-07-06'),
        inspectorName: 'Ira Inspector',
      },
      signal,
    )
    if (bytes === null) throw new Error('no certificate')
    expect(await pdfWording(bytes)).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Certificate of Occupancy

      CO-2027-0001

      Town of Alder Pond certifies that the work under permit BP-2027-0002 was inspected and the building
      may be occupied.

      Certificate number
      CO-2027-0001

      Permit number
      BP-2027-0002

      Parcel
      007001000000

      Site address

      Owner

      Use
      Not recorded

      Issued
      July 7, 2027

      Final inspection
      July 6, 2027, Ira Inspector

      Code edition
      Not recorded

      Conditions

      Condition

      Approved septic design on file

      Authorized signature

      Page 1 of 1

      "
    `)
  })
})
