import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition } from '@/features/renditions/approvals'
import { createRelease } from '@/features/rtk/releases'
import { logRequest } from '@/features/rtk/requests'
import { buildResponseLetter } from '@/features/rtk/responseLetter'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfWording } from '@/test/pdfWording'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let custodian: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterEach(async () => {
  await handle.drop()
})

describe('right-to-know response letter wording', () => {
  it('time statement with a cost estimate, a release and a withholding', async () => {
    const logged = await logRequest(
      handle.db,
      custodian,
      {
        receivedOn: d('2027-07-02'),
        receivedVia: 'email',
        requesterName: 'Jordan Reyes',
        requesterContact: 'jordan@example.test',
        description: 'The Birch Lane owner letters',
      },
      signal,
      NOW,
    )
    if (!logged.ok) throw new Error(logged.error)
    const requestId = logged.value.requestId
    const response = await recordFirstResponse(
      handle.db,
      store,
      custodian,
      {
        requestId,
        kind: 'time_statement',
        respondedOn: d('2027-07-09'),
        timeStatement: {
          statedDate: d('2027-07-30'),
          delayReason: 'The records are in off-site storage and must be retrieved and reviewed.',
          costEstimate: [
            { label: 'Copies, 120 pages', cents: 1200 },
            { label: 'Staff time, 2 hours', cents: 5000 },
          ],
        },
      },
      signal,
      NOW,
    )
    if (!response.ok) throw new Error(response.error)
    const doc = await uploadRedactionFixture(
      handle.db,
      store,
      custodian,
      'letter.pdf',
      undefined,
      false,
    )
    const redactedId = await redactedVersionOf(
      handle.db,
      store,
      custodian,
      doc,
      'rtk_release',
      requestId,
    )
    const approved = await approveRendition(
      handle.db,
      custodian,
      {
        versionId: redactedId,
        purpose: 'rtk_release',
        rtkRequestId: requestId,
        reviewStatement: STATEMENT,
      },
      signal,
      store,
    )
    if (!approved.ok) throw new Error(approved.error)
    const withheld = await recordWithholding(
      handle.db,
      custodian,
      {
        requestId,
        scope: 'withheld_in_full',
        recordDescription: 'Email from the town attorney',
        exemptionKey: 'nh.rtk.91a5.xii',
        explanation: 'The email is a confidential communication seeking legal advice.',
      },
      signal,
    )
    if (!withheld.ok) throw new Error(withheld.error)
    const released = await createRelease(
      handle.db,
      store,
      createMemoryTransport(),
      custodian,
      {
        requestId,
        releasedOn: d('2027-07-09'),
        method: 'paper',
        items: [{ documentId: doc.documentId, approvalId: approved.value.approvalId }],
      },
      signal,
      NOW,
    )
    if (!released.ok) throw new Error(released.error)
    const letter = await buildResponseLetter(handle.db, requestId, signal)
    expect(await pdfWording(letter)).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Response to your Right-to-Know request

      RK-2027-0001

      Request number
      RK-2027-0001

      Received
      July 2, 2027

      Your request
      The Birch Lane owner letters

      The town needs more time to respond to your request.

      Time the town needs

      Statement made
      July 9, 2027

      Response by
      July 30, 2027

      Reason
      The records are in off-site storage and must be retrieved and reviewed.

      Estimated charge
      Amount

      Copies, 120 pages
      $12.00
      Staff time, 2 hours
      $50.00
      Total
      $62.00

      Records released

      Release
      Date
      How
      Record

      1
      July 9, 2027
      Paper copy
      letter.pdf

      Records withheld or redacted

      Record
      Exemption
      Explanation

      Email from the town attorney
      Attorney-client privileged
      communications and attorney
      work product (RSA 91-A:5 XII)

      The email is a confidential
      communication seeking legal
      advice.
      letter.pdf (redacted)
      Internal personnel practices,
      confidential, commercial, or
      financial information, test data,
      and files whose disclosure would
      invade privacy (RSA 91-A:5 IV)

      The number is a private phone
      number that invades the owner
      privacy.

      Page 1 of 1

      "
    `)
  })
})
