import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { documents, files } from '@/db/schema'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let applicationId: string

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  applicationId = (await makeApplication(handle.db, world)).applicationId
})
afterAll(async () => {
  await handle.drop()
})

const intentInput = (id: string, size = 20) => ({
  target: { kind: 'application' as const, id },
  title: 'Plan',
  filename: 'plan.pdf',
  contentType: 'application/pdf' as const,
  sizeBytes: size,
})

describe('upload intents', () => {
  it('application upload defaults to private', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      { kind: 'application', id: applicationId },
      pdfBytes('private default'),
    )
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, up.documentId))
    expect(doc?.isPublic).toBe(false)
    expect(doc?.audiences).toEqual(['project_parties', 'reviewers'])
  })

  it('parcel-file upload by staff defaults to public with all audiences', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'parcel', id: world.parcelId },
      pdfBytes('parcel file'),
      { title: 'Survey', seriesKey: 'nh.rs.blueprints_architectural' },
    )
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, up.documentId))
    expect(doc?.isPublic).toBe(true)
    expect(doc?.audiences).toEqual(['project_parties', 'reviewers', 'board'])
  })

  it('an applicant cannot upload to a parcel', async () => {
    const parcel = await createUploadIntent(
      handle.db,
      store,
      world.applicant,
      { ...intentInput(world.parcelId), target: { kind: 'parcel', id: world.parcelId } },
      signal,
    )
    expect(parcel).toEqual({ ok: false, error: 'forbidden' })
  })

  it("applicant upload to another applicant's application is forbidden", async () => {
    const stranger = await staffActor(handle.db, 'applicant')
    const result = await createUploadIntent(
      handle.db,
      store,
      stranger,
      intentInput(applicationId),
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('upload over MAX_UPLOAD_BYTES is too_large', async () => {
    const result = await createUploadIntent(
      handle.db,
      store,
      world.applicant,
      intentInput(applicationId, env.MAX_UPLOAD_BYTES + 1),
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'too_large' })
  })

  it('a type outside the allowed list is type_not_allowed', async () => {
    const result = await createUploadIntent(
      handle.db,
      store,
      world.applicant,
      { ...intentInput(applicationId), contentType: 'text/html' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'type_not_allowed' })
  })

  it('declared pdf with png bytes is type_mismatch', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
    await expect(
      uploadAs(handle.db, store, world.applicant, { kind: 'application', id: applicationId }, png),
    ).rejects.toThrow('type_mismatch')
  })

  it('finalize after 15 minutes is expired', async () => {
    const bytes = pdfBytes('too late')
    const intent = await createUploadIntent(
      handle.db,
      store,
      world.applicant,
      intentInput(applicationId, bytes.length),
      signal,
    )
    if (!intent.ok) throw new Error('intent')
    await fetch(intent.value.url, {
      method: 'PUT',
      headers: intent.value.headers,
      body: new Blob([bytes]),
    })
    const late = new Date(Date.now() + 16 * 60 * 1000)
    const result = await finalizeUpload(
      handle.db,
      store,
      world.applicant,
      { intentId: intent.value.intentId },
      signal,
      late,
    )
    expect(result).toEqual({ ok: false, error: 'expired' })
  })

  it('finalize without an uploaded object is not_uploaded and a second finalize is already_finalized', async () => {
    const intent = await createUploadIntent(
      handle.db,
      store,
      world.applicant,
      intentInput(applicationId),
      signal,
    )
    if (!intent.ok) throw new Error('intent')
    const none = await finalizeUpload(
      handle.db,
      store,
      world.applicant,
      { intentId: intent.value.intentId },
      signal,
    )
    expect(none).toEqual({ ok: false, error: 'not_uploaded' })
    const bytes = pdfBytes('twice')
    const first = await uploadAs(
      handle.db,
      store,
      world.applicant,
      { kind: 'application', id: applicationId },
      bytes,
    )
    const again = await finalizeUpload(
      handle.db,
      store,
      world.applicant,
      { intentId: first.intentId },
      signal,
    )
    expect(again).toEqual({ ok: false, error: 'already_finalized' })
  })

  it("another user cannot finalize someone else's intent", async () => {
    const intent = await createUploadIntent(
      handle.db,
      store,
      world.applicant,
      intentInput(applicationId),
      signal,
    )
    if (!intent.ok) throw new Error('intent')
    const result = await finalizeUpload(
      handle.db,
      store,
      world.staff,
      { intentId: intent.value.intentId },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an upload stores one files row per distinct content', async () => {
    const before = (await handle.db.select().from(files)).length
    const bytes = pdfBytes('same bytes')
    const target = { kind: 'application' as const, id: applicationId }
    await uploadAs(handle.db, store, world.applicant, target, bytes)
    await uploadAs(handle.db, store, world.applicant, target, bytes)
    expect((await handle.db.select().from(files)).length).toBe(before + 1)
  })
})
