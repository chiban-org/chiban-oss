import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { documents, inspections, retentionAssignments } from '@/db/schema'
import { downloadDocument } from '@/features/documents/download'
import { listDocuments } from '@/features/documents/listDocuments'
import { searchDocuments, searchPublicDocuments } from '@/features/documents/search'
import { createUploadIntent } from '@/features/documents/uploads'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { uploadAs } from '@/test/documentFixtures'
import {
  type InspectionWorld,
  newIssuedPermit,
  RESULT_NOW,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { makeTestStore } from '@/test/minio'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld
let store: ObjectStore

function jpegBytes(marker: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(marker)])
}

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  store = (await makeTestStore()).store
})
afterAll(async () => {
  await handle.drop()
})

async function photoFor(inspectionId: string, actor = w.inspector) {
  return await uploadAs(
    handle.db,
    store,
    actor,
    { kind: 'inspection', id: inspectionId },
    jpegBytes(`photo ${inspectionId}`),
    { title: 'Panel photo', filename: 'panel.jpg', contentType: 'image/jpeg' },
  )
}

async function intentFor(inspectionId: string, actor: typeof w.inspector, now: Date) {
  return await createUploadIntent(
    handle.db,
    store,
    actor,
    {
      target: { kind: 'inspection', id: inspectionId },
      title: 'Photo',
      filename: 'p.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 12,
    },
    signal,
    now,
  )
}

describe('inspection photos', () => {
  it('inspector uploads a jpeg to a scheduled inspection and it attaches as inspection_photo', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const up = await photoFor(id)
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, up.documentId))
    expect(doc).toMatchObject({
      recordKind: 'inspection',
      recordId: id,
      docKind: 'inspection_photo',
      isPublic: false,
      audiences: ['project_parties'],
    })
    const series = await handle.db
      .select()
      .from(retentionAssignments)
      .where(eq(retentionAssignments.recordId, up.documentId))
    expect(series).toHaveLength(1)
  })

  it('upload within 7 days of the result is allowed and 8 days is forbidden', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    await handle.db
      .update(inspections)
      .set({ status: 'passed', resultRecordedAt: RESULT_NOW })
      .where(eq(inspections.id, id))
    const day = 24 * 60 * 60 * 1000
    const inside = await intentFor(id, w.inspector, new Date(RESULT_NOW.getTime() + 6 * day))
    expect(inside.ok).toBe(true)
    const outside = await intentFor(id, w.inspector, new Date(RESULT_NOW.getTime() + 8 * day))
    expect(outside).toEqual({ ok: false, error: 'forbidden' })
  })

  it('finance upload to an inspection is forbidden', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    expect(await intentFor(id, w.finance, RESULT_NOW)).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an inspector who is not assigned is forbidden, and a cancelled inspection takes no photos', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    expect(await intentFor(id, w.otherInspector, RESULT_NOW)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    await handle.db.update(inspections).set({ status: 'cancelled' }).where(eq(inspections.id, id))
    expect(await intentFor(id, w.inspector, RESULT_NOW)).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an applicant party sees the photo; another applicant gets 404 on download', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const up = await photoFor(id)
    const mine = await downloadDocument(
      handle.db,
      store,
      w.world.applicant,
      up.documentId,
      'default',
      signal,
    )
    expect(mine.ok).toBe(true)
    const theirs = await downloadDocument(
      handle.db,
      store,
      w.stranger,
      up.documentId,
      'default',
      signal,
    )
    expect(theirs).toEqual({ ok: false, error: 'not_found' })
    const signedOut = await downloadDocument(
      handle.db,
      store,
      null,
      up.documentId,
      'default',
      signal,
    )
    expect(signedOut).toEqual({ ok: false, error: 'not_found' })
  })

  it('reviewer cannot list inspection photos', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    await photoFor(id)
    const asReviewer = await listDocuments(
      handle.db,
      w.world.reviewer,
      { record: { kind: 'inspection', id }, limit: 10 },
      signal,
    )
    expect(asReviewer.rows).toHaveLength(0)
    const asParty = await listDocuments(
      handle.db,
      w.world.applicant,
      { record: { kind: 'inspection', id }, limit: 10 },
      signal,
    )
    expect(asParty.rows).toHaveLength(1)
  })

  it('photo is not public and public search never returns it', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const up = await photoFor(id)
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, up.documentId))
    expect(doc?.isPublic).toBe(false)
    expect(await searchPublicDocuments(handle.db, { q: 'Panel photo' }, signal)).toEqual([])
    const stranger = await searchDocuments(handle.db, w.stranger, { q: 'Panel photo' }, signal)
    expect(stranger.rows).toEqual([])
  })
})
