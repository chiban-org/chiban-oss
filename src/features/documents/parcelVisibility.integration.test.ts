import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { documents, renditionApprovals } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { resolveRendition } from '@/features/documents/visibility'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor
let parcelId: string

beforeAll(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  parcelId = await makeParcel(handle.db, [])
})
afterAll(async () => {
  await handle.drop()
})

async function upload(marker: string, isPublic?: boolean) {
  return await uploadAs(
    handle.db,
    store,
    staff,
    { kind: 'parcel', id: parcelId },
    pdfBytes(marker),
    {
      seriesKey: 'nh.rs.correspondence_administrative',
      ...(isPublic === undefined ? {} : { isPublic }),
    },
  )
}

async function state(documentId: string) {
  const [doc] = await handle.db.select().from(documents).where(eq(documents.id, documentId))
  const approvals = await handle.db
    .select()
    .from(renditionApprovals)
    .where(eq(renditionApprovals.documentId, documentId))
  const visitor = await resolveRendition(handle.db, null, documentId, signal)
  return { isPublic: doc?.isPublic, approvals: approvals.length, visitor: visitor.ok }
}

describe('parcel file visibility on upload', () => {
  it('a parcel file uploaded without a public choice stays private with no approval', async () => {
    const up = await upload('Owner phone 603-555-0147')
    expect(await state(up.documentId)).toEqual({ isPublic: false, approvals: 0, visitor: false })
  })

  it('a parcel file uploaded as private stays private', async () => {
    const up = await upload('private letter', false)
    expect(await state(up.documentId)).toEqual({ isPublic: false, approvals: 0, visitor: false })
  })

  it('only an explicit public choice publishes the file with a system approval', async () => {
    const up = await upload('public plan', true)
    expect(await state(up.documentId)).toEqual({ isPublic: true, approvals: 1, visitor: true })
  })

  it('someone who may not publish documents cannot upload a parcel file as public', async () => {
    const custodian = await staffActor(handle.db, 'records_custodian')
    await expect(
      uploadAs(
        handle.db,
        store,
        custodian,
        { kind: 'parcel', id: parcelId },
        pdfBytes('custodian'),
        {
          seriesKey: 'nh.rs.correspondence_administrative',
          isPublic: true,
        },
      ),
    ).rejects.toThrow('finalize: forbidden')
    const published = await handle.db.select().from(documents).where(eq(documents.isPublic, true))
    expect(published.every((d) => d.title !== 'custodian')).toBe(true)
  })
})
