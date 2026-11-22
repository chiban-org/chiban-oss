import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documentVersions, files } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition } from '@/features/renditions/approvals'
import { createRelease } from '@/features/rtk/releases'
import { logRequest } from '@/features/rtk/requests'
import { buildResponseLetter } from '@/features/rtk/responseLetter'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { publishTownProfileSection } from '@/features/town/profileSettings'
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

async function storedPdf(documentId: string): Promise<Uint8Array> {
  const [version] = await handle.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
  const [file] = await handle.db
    .select()
    .from(files)
    .where(eq(files.sha256, version?.fileSha256 ?? ''))
  const stream = await store.getStream(file?.storageKey ?? '', signal)
  if (!stream.ok) throw new Error('bytes')
  return new Uint8Array(await new Response(stream.value).arrayBuffer())
}

async function loggedFor(requesterName: string | undefined): Promise<string> {
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: d('2027-07-02'),
      receivedVia: 'email',
      ...(requesterName === undefined ? {} : { requesterName }),
      description: 'The Birch Lane owner letters',
    },
    signal,
    NOW,
  )
  if (!logged.ok) throw new Error(logged.error)
  return logged.value.requestId
}

describe('right-to-know response letter wording', () => {
  it('time statement with a cost estimate, a release and a withholding', async () => {
    const requestId = await loggedFor('Jordan Reyes')
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
    const letter = await storedPdf(released.value.letterDocumentId)
    const wording = await pdfWording(letter)
    expect(wording).toContain('The town is releasing the records listed below.')
    expect(wording).toContain('On July 9, 2027 the town said it needed until July 30, 2027.')
    expect(wording).not.toContain('The town needs more time to respond to your request.')
    expect(wording).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Response to your Right-to-Know request

      RK-2027-0001

      Date
      July 14, 2027

      To
      Jordan Reyes

      Request number
      RK-2027-0001

      Received
      July 2, 2027

      Your request
      The Birch Lane owner letters

      The town is releasing the records listed below.

      On July 9, 2027 the town said it needed until July 30, 2027.

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

      Town clerk signature

      Page 1 of 1

      "
    `)
  })

  it('the default letter is dated, addressed and signed by the town clerk', async () => {
    const admin = await staffActor(handle.db, 'admin')
    const published = await publishTownProfileSection(
      handle.db,
      admin,
      {
        section: 'signers',
        slice: {
          signers: [
            { role: 'town_clerk', name: 'Morgan Vale', title: 'Town Clerk', signature: null },
          ],
        },
      },
      signal,
    )
    if (!published.ok) throw new Error(JSON.stringify(published.error))
    const requestId = await loggedFor('Jordan Reyes')
    const wording = await pdfWording(
      await buildResponseLetter(handle.db, requestId, signal, { now: NOW }),
    )
    expect(wording).toContain('Date\nJuly 14, 2027')
    expect(wording).toContain('To\nJordan Reyes')
    expect(wording).toContain('Morgan Vale\nTown Clerk')
    expect(wording.indexOf('July 14, 2027')).toBeLessThan(wording.indexOf('Request number'))
  })

  it('a letter to a requester with no name on file is addressed to the requester', async () => {
    const requestId = await loggedFor(undefined)
    const wording = await pdfWording(
      await buildResponseLetter(handle.db, requestId, signal, { now: NOW }),
    )
    expect(wording).toContain('To\nThe requester')
    expect(wording).toContain('Town clerk signature')
  })
})
