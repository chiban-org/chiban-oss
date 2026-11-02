import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { files } from '@/db/schema'
import { blobKey } from '@/features/files/ingest'
import { matchContentType, type SignatureTable, SNIFF_BYTES } from '@/features/files/sniff'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export async function digestFile(
  path: string,
  signal: AbortSignal,
): Promise<{ sha256: string; size: number; head: Uint8Array }> {
  const hash = createHash('sha256')
  let size = 0
  const head = Buffer.alloc(SNIFF_BYTES)
  let filled = 0
  for await (const chunk of createReadStream(path, { signal })) {
    const buf = chunk as Buffer
    hash.update(buf)
    size += buf.length
    if (filled < SNIFF_BYTES) filled += buf.copy(head, filled, 0, SNIFF_BYTES - filled)
  }
  return { sha256: hash.digest('hex'), size, head: head.subarray(0, filled) }
}

export async function ingestLocalFile(
  db: DbOrTx,
  store: ObjectStore,
  path: string,
  allowed: SignatureTable,
  signal: AbortSignal,
): Promise<
  Result<
    { sha256: string; contentType: string; created: boolean },
    'type_not_allowed' | 'read_error'
  >
> {
  signal.throwIfAborted()
  try {
    const digest = await digestFile(path, signal)
    const contentType = matchContentType(allowed, digest.head)
    if (contentType === null) return err('type_not_allowed')
    const [known] = await db
      .select({ sha: files.sha256 })
      .from(files)
      .where(eq(files.sha256, digest.sha256))
    if (known !== undefined) return ok({ sha256: digest.sha256, contentType, created: false })
    await store.upload(blobKey(digest.sha256), createReadStream(path), contentType, signal)
    const inserted = await db
      .insert(files)
      .values({
        sha256: digest.sha256,
        sizeBytes: digest.size,
        contentType,
        storageKey: blobKey(digest.sha256),
      })
      .onConflictDoNothing()
      .returning({ sha: files.sha256 })
    return ok({ sha256: digest.sha256, contentType, created: inserted.length > 0 })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return err('read_error')
  }
}
