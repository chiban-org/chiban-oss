import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { searchPublicDocuments } from '@/features/documents/search'
import { openCase } from '@/features/enforcement/cases'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { approvePublic } from '@/test/renditionFixtures'
import { indexText, textPdf } from '@/test/searchFixtures'

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

describe('public search follows the same visibility as the public download', () => {
  it('a document on a private enforcement case never appears in public search', async () => {
    const opened = await openCase(handle.db, staff, { locationText: '14 Birch Lane' }, signal)
    if (!opened.ok) throw new Error('case')
    const doc = await uploadAs(
      handle.db,
      store,
      staff,
      { kind: 'enforcement_case', id: opened.value.caseId },
      await textPdf('Complainant Dana Whitfield saw the shed built without a permit'),
      {
        title: 'Complaint photo log',
        docKind: 'enforcement_photo',
      },
    )
    await indexText(handle.db, store)
    await approvePublic(handle.db, staff, doc.versionId, store)
    await handle.db
      .update(documents)
      .set({ isPublic: true })
      .where(eq(documents.id, doc.documentId))
    expect(await searchPublicDocuments(handle.db, { q: 'Whitfield' }, signal)).toEqual([])
  })

  it('a disposed or Right-to-Know letter document never appears in public search', async () => {
    const opened = await openCase(handle.db, staff, { locationText: 'Elm Street' }, signal)
    if (!opened.ok) throw new Error('case')
    const doc = await uploadAs(
      handle.db,
      store,
      staff,
      { kind: 'enforcement_case', id: opened.value.caseId },
      await textPdf('Retired record about Quincy'),
      {
        title: 'Retired',
        docKind: 'enforcement_photo',
      },
    )
    await indexText(handle.db, store)
    await approvePublic(handle.db, staff, doc.versionId, store)
    await handle.db
      .update(documents)
      .set({ isPublic: true, disposedAt: new Date() })
      .where(eq(documents.id, doc.documentId))
    expect(await searchPublicDocuments(handle.db, { q: 'Quincy' }, signal)).toEqual([])
  })
})
