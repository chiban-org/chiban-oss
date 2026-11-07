import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documents, enforcementCases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { loadPanelDocuments, type PanelDocument } from '@/features/documents/panelData'
import { documentVisibleTo } from '@/features/documents/visibility'
import { publicChip, publicStateOf, publicViewHref } from '@/features/documents/whoCanSee'
import { openCase } from '@/features/enforcement/cases'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import { approvePublic } from '@/test/renditionFixtures'
import { textPdf } from '@/test/searchFixtures'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor
let parcelId: string

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '007012000000' }])
})
afterEach(async () => {
  await handle.drop()
})

async function publiclyVisible(documentId: string): Promise<boolean> {
  const rows = await handle.db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), documentVisibleTo(null)))
  return rows.length === 1
}

async function shownPublicDocument(target: PanelDocument['recordKind'], recordId: string) {
  const doc = await uploadAs(
    handle.db,
    store,
    staff,
    { kind: target, id: recordId },
    await textPdf('Photo log for the shed'),
    target === 'enforcement_case'
      ? { title: 'Photo log', docKind: 'enforcement_photo' }
      : { title: 'Photo log', seriesKey: 'nh.rs.correspondence_administrative' },
  )
  await approvePublic(handle.db, staff, doc.versionId, store)
  await handle.db.update(documents).set({ isPublic: true }).where(eq(documents.id, doc.documentId))
  return doc.documentId
}

async function panelDoc(kind: PanelDocument['recordKind'], id: string): Promise<PanelDocument> {
  const [doc] = await loadPanelDocuments(handle.db, staff, { kind, id }, signal)
  if (doc === undefined) throw new Error('no panel document')
  return doc
}

describe('the document panel agrees with public visibility', () => {
  it('keeps a document on a private case off the public site, then shows it once the case is public', async () => {
    const opened = await openCase(
      handle.db,
      staff,
      { parcelId, locationText: '12 Birch Lane' },
      signal,
    )
    if (!opened.ok) throw new Error('case')
    const caseId = opened.value.caseId
    const documentId = await shownPublicDocument('enforcement_case', caseId)

    const hidden = await panelDoc('enforcement_case', caseId)
    expect(hidden.caseIsPublic).toBe(false)
    expect(hidden.parcelId).toBe(parcelId)
    expect(publicStateOf(hidden).shown).toBe(false)
    expect(publicChip(hidden).label).toBe('Not on the public site')
    expect(publicViewHref(hidden)).toBeNull()
    expect(await publiclyVisible(documentId)).toBe(false)

    await handle.db
      .update(enforcementCases)
      .set({ isPublic: true, publicSummary: 'Shed built without a permit.' })
      .where(eq(enforcementCases.id, caseId))

    const shown = await panelDoc('enforcement_case', caseId)
    expect(shown.caseIsPublic).toBe(true)
    expect(publicStateOf(shown).shown).toBe(true)
    expect(publicChip(shown).label).toBe('Shown on the public site')
    expect(publicViewHref(shown)).toBe(`/parcels/${parcelId}`)
    expect(await publiclyVisible(documentId)).toBe(true)
  })

  it('carries no case gate and the parcel for a parcel document', async () => {
    const documentId = await shownPublicDocument('parcel', parcelId)
    const doc = await panelDoc('parcel', parcelId)
    expect(doc.recordKind).toBe('parcel')
    expect(doc.caseIsPublic).toBeNull()
    expect(doc.parcelId).toBe(parcelId)
    expect(publicStateOf(doc).shown).toBe(true)
    expect(await publiclyVisible(documentId)).toBe(true)
  })

  it('has no parcel for a document on a case without one', async () => {
    const opened = await openCase(handle.db, staff, { locationText: 'Elm Street' }, signal)
    if (!opened.ok) throw new Error('case')
    await shownPublicDocument('enforcement_case', opened.value.caseId)
    const doc = await panelDoc('enforcement_case', opened.value.caseId)
    expect(doc.parcelId).toBeNull()
    expect(publicViewHref(doc)).toBeNull()
  })
})
