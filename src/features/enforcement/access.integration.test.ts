import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documents, enforcementCases } from '@/db/schema'
import { listDocuments } from '@/features/documents/listDocuments'
import { createUploadIntent } from '@/features/documents/uploads'
import { getCase, listCases } from '@/features/enforcement/access'
import { openCase } from '@/features/enforcement/cases'
import { recordComplaint } from '@/features/enforcement/complaints'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { approvePublic } from '@/test/renditionFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function openOne(location: string) {
  const staff = await staffActor(handle.db, 'staff')
  const opened = await openCase(handle.db, staff, { locationText: location }, signal, NOW)
  if (!opened.ok) throw new Error(opened.error)
  return opened.value.caseId
}

describe('enforcement case access', () => {
  it('reviewer and applicant get 404 for a private case', async () => {
    const caseId = await openOne('14 Birch Lane')
    const reviewer = await staffActor(handle.db, 'reviewer')
    const applicant = await staffActor(handle.db, 'applicant')
    for (const viewer of [reviewer, applicant, null]) {
      expect(await getCase(handle.db, viewer, caseId, signal)).toEqual({
        ok: false,
        error: 'not_found',
      })
    }
  })

  it('staff with full record access can read a private case', async () => {
    const caseId = await openOne('14 Birch Lane')
    const inspector = await staffActor(handle.db, 'inspector')
    const read = await getCase(handle.db, inspector, caseId, signal)
    expect(read.ok && read.value.kind === 'staff').toBe(true)
  })

  it('public list with 30 cases of which 3 are public returns 3 under a page cap of 25', async () => {
    const ids: string[] = []
    for (let i = 0; i < 30; i++) ids.push(await openOne(`${i} Birch Lane`))
    for (const id of [ids[2], ids[14], ids[28]]) {
      await handle.db
        .update(enforcementCases)
        .set({ isPublic: true, publicSummary: 'Open violation' })
        .where(eq(enforcementCases.id, id ?? ''))
    }
    const page = await listCases(handle.db, null, { filters: {}, limit: 25 }, signal)
    expect(page.rows).toHaveLength(3)
    expect(page.nextCursor).toBeNull()
    const staff = await staffActor(handle.db, 'staff')
    const staffPage = await listCases(handle.db, staff, { filters: {}, limit: 25 }, signal)
    expect(staffPage.rows).toHaveLength(25)
    expect(staffPage.nextCursor).not.toBeNull()
  })

  it('public view never includes description_original or complainant fields', async () => {
    const complaint = await recordComplaint(
      handle.db,
      null,
      {
        channel: 'public_named',
        locationText: '14 Birch Lane',
        description: 'ORIGINAL-SECRET text',
        name: 'Pat Neighbor',
        email: 'pat@example.test',
      },
      signal,
      NOW,
    )
    if (!complaint.ok) throw new Error('complaint')
    const caseId = complaint.value.caseId
    await handle.db
      .update(enforcementCases)
      .set({ isPublic: true, publicSummary: 'Open violation' })
      .where(eq(enforcementCases.id, caseId))
    const view = await getCase(handle.db, null, caseId, signal)
    expect(view.ok && view.value.kind).toBe('public')
    const text = JSON.stringify(view)
    for (const secret of ['ORIGINAL-SECRET', 'Pat Neighbor', 'pat@example.test', 'complainant']) {
      expect(text).not.toContain(secret)
    }
  })

  it('a published document on a private case stays hidden from the public and non-staff', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const caseId = await openOne('14 Birch Lane')
    const { store } = await makeTestStore()
    const up = await uploadAs(
      handle.db,
      store,
      staff,
      { kind: 'enforcement_case', id: caseId },
      pdfBytes('photo-1'),
      { title: 'Front yard', docKind: 'enforcement_photo' },
    )
    await approvePublic(handle.db, staff, up.versionId, store)
    await handle.db.update(documents).set({ isPublic: true }).where(eq(documents.id, up.documentId))
    const record = { kind: 'enforcement_case' as const, id: caseId }
    const reviewer = await staffActor(handle.db, 'reviewer')
    for (const viewer of [null, reviewer]) {
      const list = await listDocuments(handle.db, viewer, { record, limit: 10 }, signal)
      expect(list.rows).toHaveLength(0)
    }
    const staffList = await listDocuments(handle.db, staff, { record, limit: 10 }, signal)
    expect(staffList.rows.map((r) => r.docKind)).toEqual(['enforcement_photo'])
    await handle.db
      .update(enforcementCases)
      .set({ isPublic: true, publicSummary: 'Open violation' })
      .where(eq(enforcementCases.id, caseId))
    const publicList = await listDocuments(handle.db, null, { record, limit: 10 }, signal)
    expect(publicList.rows).toHaveLength(1)
  })

  it('a reviewer cannot request an upload to a case', async () => {
    const caseId = await openOne('14 Birch Lane')
    const { store } = await makeTestStore()
    const reviewer = await staffActor(handle.db, 'reviewer')
    const intent = await createUploadIntent(
      handle.db,
      store,
      reviewer,
      {
        target: { kind: 'enforcement_case', id: caseId },
        title: 'x',
        filename: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 20,
        docKind: 'enforcement_photo',
      },
      signal,
    )
    expect(intent).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an enforcement document kind on another record kind is refused', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const { store } = await makeTestStore()
    const intent = await createUploadIntent(
      handle.db,
      store,
      staff,
      {
        target: { kind: 'parcel', id: crypto.randomUUID() },
        title: 'x',
        filename: 'x.pdf',
        contentType: 'application/pdf',
        sizeBytes: 20,
        docKind: 'service_proof',
        seriesKey: 'nh.rs.code_enforcement_specifications',
      },
      signal,
    )
    expect(intent).toEqual({ ok: false, error: 'doc_kind_not_allowed' })
  })
})
