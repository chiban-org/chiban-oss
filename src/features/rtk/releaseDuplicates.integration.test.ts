import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rtkReleases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { approveRendition } from '@/features/renditions/approvals'
import { createRelease } from '@/features/rtk/releases'
import { loadRequestApprovals } from '@/features/rtk/requestPage'
import { logRequest } from '@/features/rtk/requests'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let custodian: Actor
let requestId: string

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  const logged = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: '2027-07-02',
      receivedVia: 'email',
      description: 'The Birch Lane owner letters',
    },
    signal,
    NOW,
  )
  if (!logged.ok) throw new Error('log')
  requestId = logged.value.requestId
})
afterEach(async () => {
  await handle.drop()
})

async function approve(versionId: string): Promise<string> {
  const approved = await approveRendition(
    handle.db,
    custodian,
    { versionId, purpose: 'rtk_release', rtkRequestId: requestId, reviewStatement: STATEMENT },
    signal,
    store,
  )
  if (!approved.ok) throw new Error(`approve ${approved.error}`)
  return approved.value.approvalId
}

async function twoApprovalsOnOneDocument() {
  const doc = await uploadRedactionFixture(
    handle.db,
    store,
    custodian,
    'letter.pdf',
    undefined,
    false,
  )
  const redacted = await redactedVersionOf(
    handle.db,
    store,
    custodian,
    doc,
    'rtk_release',
    requestId,
  )
  return {
    documentId: doc.documentId,
    original: await approve(doc.versionId),
    redacted: await approve(redacted),
  }
}

const release = (items: { documentId: string; approvalId: string }[]) =>
  createRelease(
    handle.db,
    store,
    createMemoryTransport(),
    custodian,
    { requestId, releasedOn: '2027-07-14', method: 'paper', items },
    signal,
    NOW,
  )

describe('a document with two approvals for one request', () => {
  it('refuses a release naming the document twice and writes nothing', async () => {
    const { documentId, original, redacted } = await twoApprovalsOnOneDocument()
    expect(
      await release([
        { documentId, approvalId: original },
        { documentId, approvalId: redacted },
      ]),
    ).toEqual({ ok: false, error: 'duplicate_document' })
    expect(
      await handle.db.select().from(rtkReleases).where(eq(rtkReleases.requestId, requestId)),
    ).toEqual([])
  })

  it('releases one chosen version of the document', async () => {
    const { documentId, redacted } = await twoApprovalsOnOneDocument()
    expect((await release([{ documentId, approvalId: redacted }])).ok).toBe(true)
    const approvals = await loadRequestApprovals(handle.db, requestId)
    expect(approvals.map((a) => a.releasedIn).sort()).toEqual([1, null])
  })
})
