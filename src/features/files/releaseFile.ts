import { eq } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { dispositionTombstones, fileDeletions, files, fileTombstones } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { withFileLock } from '@/features/files/fileLock'
import { blobKey, fileReferenceCount } from '@/features/files/ingest'
import type { ObjectStore } from '@/features/storage/objectStore'

export async function releaseFileIfUnreferenced(
  db: DbOrTx,
  sha256: string,
  batchId: string,
  signal: AbortSignal,
): Promise<'released' | 'still_referenced'> {
  return await withFileLock(db, sha256, signal, async (tx: Tx) => {
    if ((await fileReferenceCount(tx, sha256, signal)) > 0) return 'still_referenced'
    const [row] = await tx.select().from(files).where(eq(files.sha256, sha256))
    if (row !== undefined) {
      await tx.delete(files).where(eq(files.sha256, sha256))
      await tx
        .insert(fileTombstones)
        .values({
          sha256,
          sizeBytes: row.sizeBytes,
          contentType: row.contentType,
          batchId,
        })
        .onConflictDoNothing()
      await tx.insert(fileDeletions).values({ sha256, batchId }).onConflictDoNothing()
      await writeAudit(
        tx,
        {
          actor: { kind: 'system', job: 'files.release' },
          action: 'file.released',
          entityType: 'file',
          entityId: sha256,
          after: { batchId },
        },
        signal,
      )
    }
    return 'released'
  })
}

export async function releaseBatchFiles(
  db: DbOrTx,
  batchId: string,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted()
  const tombstones = await db
    .select({ hashes: dispositionTombstones.fileSha256s })
    .from(dispositionTombstones)
    .where(eq(dispositionTombstones.batchId, batchId))
  const hashes = [...new Set(tombstones.flatMap((t) => t.hashes))]
  const released: string[] = []
  for (const sha256 of hashes) {
    if ((await releaseFileIfUnreferenced(db, sha256, batchId, signal)) === 'released') {
      const [stillTracked] = await db.select().from(files).where(eq(files.sha256, sha256))
      const [queued] = await db.select().from(fileDeletions).where(eq(fileDeletions.sha256, sha256))
      if (stillTracked === undefined && queued !== undefined) released.push(sha256)
    }
  }
  return released
}

export async function deleteQueuedFile(
  db: DbOrTx,
  store: ObjectStore,
  sha256: string,
  signal: AbortSignal,
): Promise<'deleted' | 'cancelled' | 'nothing'> {
  return await withFileLock(db, sha256, signal, async (tx: Tx) => {
    const [queued] = await tx.select().from(fileDeletions).where(eq(fileDeletions.sha256, sha256))
    if (queued === undefined) return 'nothing'
    const [present] = await tx.select().from(files).where(eq(files.sha256, sha256))
    if (present !== undefined) {
      await tx.delete(fileDeletions).where(eq(fileDeletions.sha256, sha256))
      return 'cancelled'
    }
    await store.delete(blobKey(sha256), signal)
    await tx.delete(fileDeletions).where(eq(fileDeletions.sha256, sha256))
    return 'deleted'
  })
}

async function deleteDerivedImages(
  db: DbOrTx,
  store: ObjectStore,
  batchId: string,
  signal: AbortSignal,
): Promise<void> {
  const tombstones = await db
    .select({ versionIds: dispositionTombstones.versionIds })
    .from(dispositionTombstones)
    .where(eq(dispositionTombstones.batchId, batchId))
  for (const versionId of tombstones.flatMap((t) => t.versionIds)) {
    for (const key of await store.list(`derived/${versionId}/`, signal)) {
      await store.delete(key, signal)
    }
  }
}

export async function finishDisposition(
  db: DbOrTx,
  store: ObjectStore,
  batchId: string,
  signal: AbortSignal,
): Promise<{ released: string[]; deleted: string[] }> {
  await deleteDerivedImages(db, store, batchId, signal)
  const released = await releaseBatchFiles(db, batchId, signal)
  const deleted: string[] = []
  for (const sha256 of released) {
    if ((await deleteQueuedFile(db, store, sha256, signal)) === 'deleted') deleted.push(sha256)
  }
  return { released, deleted }
}
