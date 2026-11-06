import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { files } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createUploadIntent, finalizeUpload } from '@/features/documents/uploads'
import { openCase } from '@/features/enforcement/cases'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { releaseFileIfUnreferenced } from '@/features/files/releaseFile'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { DISPOSITION_NOW } from '@/test/dispositionFixtures'
import { pdfBytes } from '@/test/documentFixtures'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const BATCH = '00000000-0000-4000-8000-000000000001'
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

async function uploadedIntent(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const opened = await openCase(
    handle.db,
    staff,
    { locationText: '9 Elm' },
    signal,
    DISPOSITION_NOW,
  )
  if (!opened.ok) throw new Error('case')
  const intent = await createUploadIntent(
    handle.db,
    store,
    staff,
    {
      target: { kind: 'enforcement_case', id: opened.value.caseId },
      title: 'Photo',
      filename: 'photo.pdf',
      contentType: 'application/pdf',
      sizeBytes: bytes.length,
      docKind: 'enforcement_photo',
    },
    signal,
  )
  if (!intent.ok) throw new Error(`intent ${intent.error}`)
  const put = await fetch(intent.value.url, {
    method: 'PUT',
    headers: intent.value.headers,
    body: new Blob([bytes]),
  })
  if (!put.ok) throw new Error(`put ${put.status}`)
  return intent.value.intentId
}

describe('file release and upload', () => {
  it('an unreferenced file being reused by an upload is not released before the upload attaches it', async () => {
    const bytes = pdfBytes('shared content')
    const { sha256 } = await storeGeneratedBytes(handle.db, store, bytes, 'application/pdf', signal)
    const intentId = await uploadedIntent(bytes)
    const held = await holdOpen(handle.db, async (tx) => {
      await tx.execute(sql`select 1 from upload_intents where id = ${intentId} for update`)
    })
    const finalizing = finalizeUpload(handle.db, store, staff, { intentId }, signal)
    const waited = await blockedOrSettled(handle.db, finalizing)
    const releasing = releaseFileIfUnreferenced(handle.db, sha256, BATCH, signal)
    await held.commit()
    expect(waited).toBe('blocked')
    const [finalized, released] = await Promise.allSettled([finalizing, releasing])
    expect(finalized.status === 'fulfilled' && finalized.value.ok).toBe(true)
    expect(released.status === 'fulfilled' && released.value).toBe('still_referenced')
    const [row] = await handle.db.select().from(files).where(eq(files.sha256, sha256))
    expect(row?.sha256).toBe(sha256)
  })
})
