import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documentVersions, files, preservationRecords } from '@/db/schema'
import { type PdfaValidator, VERAPDF_BATCH_SIZE } from '@/features/preservation/verapdf'
import type { ObjectStore } from '@/features/storage/objectStore'

async function readBytes(
  store: ObjectStore,
  key: string,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const stream = await store.getStream(key, signal)
  if (!stream.ok) return null
  return new Uint8Array(await new Response(stream.value).arrayBuffer())
}

export async function validatePendingPreservation(
  db: DbOrTx,
  store: ObjectStore,
  validator: PdfaValidator,
  signal: AbortSignal,
  limit: number = VERAPDF_BATCH_SIZE,
): Promise<number> {
  signal.throwIfAborted()
  const pending = await db
    .select({ id: preservationRecords.id, storageKey: files.storageKey })
    .from(preservationRecords)
    .innerJoin(documentVersions, eq(documentVersions.id, preservationRecords.pdfaVersionId))
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(
      and(
        eq(preservationRecords.status, 'complete'),
        isNotNull(preservationRecords.pdfaVersionId),
        isNull(preservationRecords.validation),
      ),
    )
    .orderBy(asc(preservationRecords.updatedAt), asc(preservationRecords.id))
    .limit(limit)
  const readable: { id: string; bytes: Uint8Array }[] = []
  for (const row of pending) {
    const bytes = await readBytes(store, row.storageKey, signal)
    if (bytes !== null) readable.push({ id: row.id, bytes })
  }
  if (readable.length === 0) return 0
  const results = await validator.validateMany(
    readable.map((r) => r.bytes),
    signal,
  )
  let recorded = 0
  for (const [i, row] of readable.entries()) {
    const result = results[i]
    if (result === undefined || result.status === 'not_validated') continue
    await db
      .update(preservationRecords)
      .set({ validation: result })
      .where(eq(preservationRecords.id, row.id))
    recorded += 1
  }
  return recorded
}
