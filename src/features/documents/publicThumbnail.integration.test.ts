import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { summarizeDocuments } from '@/features/documents/recordSource'
import { revokeApproval } from '@/features/renditions/approvals'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { activePublicApproval, approvePublic, redactedVersionOf } from '@/test/renditionFixtures'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
})
afterEach(async () => {
  await handle.drop()
})

const publicSummary = (id: string) =>
  summarizeDocuments(handle.db, [id], { kind: 'public' }, signal)

describe('public parcel record list', () => {
  it('public parcel page shows the approved thumbnail and never the original', async () => {
    const doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    const redacted = await redactedVersionOf(handle.db, store, staff, doc)
    await approvePublic(handle.db, staff, redacted, store)
    const rows = await publicSummary(doc.documentId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.thumbnailHref).toBe(`/api/documents/${doc.documentId}/thumbnail`)
    expect(rows[0]?.thumbnailHref).not.toContain(doc.versionId)
    expect(rows[0]?.thumbnailHref).not.toContain(redacted)
  })

  it('a public document with no approved version is not listed at all', async () => {
    const doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    const active = await activePublicApproval(handle.db, doc.documentId)
    await revokeApproval(
      handle.db,
      staff,
      { approvalId: active?.id ?? '', reason: 'Pulled until it is redacted' },
      signal,
      store,
    )
    expect(await publicSummary(doc.documentId)).toEqual([])
  })
})
