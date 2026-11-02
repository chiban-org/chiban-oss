import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dispositionTombstones, fileDeletions, files, fileTombstones } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { approveDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import {
  blobKey,
  fileReferenceCount,
  sha256Hex,
  storeGeneratedBytes,
} from '@/features/files/ingest'
import {
  deleteQueuedFile,
  finishDisposition,
  releaseBatchFiles,
  releaseFileIfUnreferenced,
} from '@/features/files/releaseFile'
import { placeHold } from '@/features/records/holds'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { DISPOSITION_NOW, eligibleCase } from '@/test/dispositionFixtures'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const AS_OF = '2027-03-01' as CivilDate
let handle: TestDb
let store: ObjectStore
let staff: Actor
let custodian: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterEach(async () => {
  await handle.drop()
})

async function disposeAll(): Promise<string> {
  const proposed = await proposeDisposition(
    handle.db,
    staff,
    { asOf: AS_OF },
    signal,
    DISPOSITION_NOW,
  )
  if (!proposed.ok) throw new Error(`propose ${proposed.error}`)
  await approveDisposition(handle.db, custodian, { batchId: proposed.value.batchId }, signal)
  const ran = await executeDisposition(handle.db, { batchId: proposed.value.batchId }, signal)
  if (!ran.ok) throw new Error('execute')
  return proposed.value.batchId
}

async function twoCasesSharing(marker: string) {
  const a = await eligibleCase(handle.db, store, staff, 1, marker)
  const b = await eligibleCase(handle.db, store, staff, 1, marker)
  return { a, b }
}

const exists = async (sha: string) => (await store.head(blobKey(sha), signal)).ok

describe('releasing files', () => {
  it('shared file survives while another referencing record remains', async () => {
    const { a, b } = await twoCasesSharing('shared bytes')
    const [fileRow] = await handle.db.select().from(files)
    const sha = fileRow?.sha256 ?? ''
    expect(await fileReferenceCount(handle.db, sha, signal)).toBe(2)
    await placeHold(
      handle.db,
      custodian,
      {
        target: { kind: 'document', id: b.documentIds[0] ?? '' },
        reason: 'Litigation hold from counsel',
      },
      signal,
    )
    const batchId = await disposeAll()
    const outcome = await finishDisposition(handle.db, store, batchId, signal)
    expect(outcome).toEqual({ released: [], deleted: [] })
    expect(await exists(sha)).toBe(true)
    expect(await handle.db.select().from(files).where(eq(files.sha256, sha))).toHaveLength(1)
    expect(await fileReferenceCount(handle.db, sha, signal)).toBe(1)
    const tombstones = await handle.db.select().from(dispositionTombstones)
    expect(tombstones.map((t) => t.recordId)).toEqual([a.documentIds[0]])
    expect(await handle.db.select().from(fileTombstones)).toEqual([])
    expect(await releaseFileIfUnreferenced(handle.db, sha, batchId, signal)).toBe(
      'still_referenced',
    )
  })

  it('file is deleted once its last reference is disposed', async () => {
    await twoCasesSharing('both go')
    const [fileRow] = await handle.db.select().from(files)
    const sha = fileRow?.sha256 ?? ''
    const batchId = await disposeAll()
    expect(await exists(sha)).toBe(true)
    const outcome = await finishDisposition(handle.db, store, batchId, signal)
    expect(outcome).toEqual({ released: [sha], deleted: [sha] })
    expect(await exists(sha)).toBe(false)
    expect(await handle.db.select().from(files)).toEqual([])
    const [tombstone] = await handle.db.select().from(fileTombstones)
    expect(tombstone).toMatchObject({ sha256: sha, batchId, contentType: 'application/pdf' })
    expect(tombstone?.sizeBytes).toBeGreaterThan(0)
    expect(await handle.db.select().from(fileDeletions)).toEqual([])
  })

  it('re-upload of the same bytes during a pending delete keeps the object', async () => {
    await eligibleCase(handle.db, store, staff, 1, 'reupload me')
    const [fileRow] = await handle.db.select().from(files)
    const sha = fileRow?.sha256 ?? ''
    const batchId = await disposeAll()
    const released = await releaseBatchFiles(handle.db, batchId, signal)
    expect(released).toEqual([sha])
    expect(await handle.db.select().from(fileDeletions)).toHaveLength(1)
    const again = await storeGeneratedBytes(
      handle.db,
      store,
      pdfBytes('reupload me 0'),
      'application/pdf',
      signal,
    )
    expect(sha256Hex(pdfBytes('reupload me 0'))).toBe(sha)
    expect(again.sha256).toBe(sha)
    expect(await handle.db.select().from(fileDeletions)).toEqual([])
    expect(await deleteQueuedFile(handle.db, store, sha, signal)).toBe('nothing')
    expect(await exists(sha)).toBe(true)
    expect(await handle.db.select().from(files).where(eq(files.sha256, sha))).toHaveLength(1)
  })

  it('a delete that finds the file row recorded again is cancelled, not performed', async () => {
    await eligibleCase(handle.db, store, staff, 1, 'cancel me')
    const [fileRow] = await handle.db.select().from(files)
    const sha = fileRow?.sha256 ?? ''
    const batchId = await disposeAll()
    await releaseBatchFiles(handle.db, batchId, signal)
    await handle.db.insert(files).values({
      sha256: sha,
      sizeBytes: 10,
      contentType: 'application/pdf',
      storageKey: blobKey(sha),
    })
    expect(await deleteQueuedFile(handle.db, store, sha, signal)).toBe('cancelled')
    expect(await exists(sha)).toBe(true)
    expect(await handle.db.select().from(fileDeletions)).toEqual([])
  })

  it('delete job twice is harmless', async () => {
    await eligibleCase(handle.db, store, staff, 1, 'twice')
    const [fileRow] = await handle.db.select().from(files)
    const sha = fileRow?.sha256 ?? ''
    const batchId = await disposeAll()
    await releaseBatchFiles(handle.db, batchId, signal)
    expect(await deleteQueuedFile(handle.db, store, sha, signal)).toBe('deleted')
    expect(await deleteQueuedFile(handle.db, store, sha, signal)).toBe('nothing')
    expect(await exists(sha)).toBe(false)
    expect(await releaseBatchFiles(handle.db, batchId, signal)).toEqual([])
  })

  it('an ingest waits for the file lock held by a release and keeps the file', async () => {
    const bytes = pdfBytes('lock me')
    const sha = sha256Hex(bytes)
    let letGo: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      letGo = resolve
    })
    let locked: () => void = () => undefined
    const holding = new Promise<void>((resolve) => {
      locked = resolve
    })
    const releasing = handle.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('file:' || ${sha}))`)
      locked()
      await gate
    })
    await holding
    let done = false
    let waited = false
    try {
      const storing = storeGeneratedBytes(handle.db, store, bytes, 'application/pdf', signal).then(
        (r) => {
          done = true
          return r
        },
      )
      await new Promise((resolve) => setTimeout(resolve, 400))
      waited = !done
      letGo()
      await releasing
      await storing
    } finally {
      letGo()
    }
    expect(waited).toBe(true)
    expect(done).toBe(true)
    expect(await handle.db.select().from(files).where(eq(files.sha256, sha))).toHaveLength(1)
  })
})
