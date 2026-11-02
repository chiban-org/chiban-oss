import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documentVersions, files } from '@/db/schema'
import { type AllowedType, SNIFF_BYTES, sniffMatches } from '@/features/files/sniff'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export function blobKey(sha256: string): string {
  return `blobs/sha256/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

interface Digest {
  sha256: string
  head: Uint8Array
}

async function digestStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<Digest> {
  const hash = createHash('sha256')
  const head = new Uint8Array(SNIFF_BYTES)
  let filled = 0
  const reader = stream.getReader()
  for (;;) {
    signal.throwIfAborted()
    const chunk = await reader.read()
    if (chunk.done) break
    hash.update(chunk.value)
    if (filled < SNIFF_BYTES) {
      const take = chunk.value.subarray(0, SNIFF_BYTES - filled)
      head.set(take, filled)
      filled += take.length
    }
  }
  return { sha256: hash.digest('hex'), head: head.subarray(0, filled) }
}

async function recordFile(
  db: DbOrTx,
  input: { sha256: string; sizeBytes: number; contentType: string },
): Promise<boolean> {
  const inserted = await db
    .insert(files)
    .values({ ...input, storageKey: blobKey(input.sha256) })
    .onConflictDoNothing()
    .returning({ sha256: files.sha256 })
  return inserted.length > 0
}

export async function ingestTempObject(
  db: DbOrTx,
  store: ObjectStore,
  input: { tempKey: string; declaredType: AllowedType; declaredSize: number },
  signal: AbortSignal,
): Promise<
  Result<{ sha256: string; created: boolean }, 'not_found' | 'size_mismatch' | 'type_mismatch'>
> {
  signal.throwIfAborted()
  try {
    const head = await store.head(input.tempKey, signal)
    if (!head.ok) return err('not_found')
    if (head.value.size !== input.declaredSize) return err('size_mismatch')
    const stream = await store.getStream(input.tempKey, signal)
    if (!stream.ok) return err('not_found')
    const digest = await digestStream(stream.value, signal)
    if (!sniffMatches(input.declaredType, digest.head)) return err('type_mismatch')
    await store.copy(input.tempKey, blobKey(digest.sha256), signal)
    const created = await recordFile(db, {
      sha256: digest.sha256,
      sizeBytes: input.declaredSize,
      contentType: input.declaredType,
    })
    return ok({ sha256: digest.sha256, created })
  } finally {
    await store.delete(input.tempKey, signal)
  }
}

export async function storeGeneratedBytes(
  db: DbOrTx,
  store: ObjectStore,
  bytes: Uint8Array,
  contentType: string,
  signal: AbortSignal,
): Promise<{ sha256: string }> {
  signal.throwIfAborted()
  const sha256 = sha256Hex(bytes)
  await store.putBytes(blobKey(sha256), bytes, contentType, signal)
  await recordFile(db, { sha256, sizeBytes: bytes.length, contentType })
  return { sha256 }
}

export async function fileReferenceCount(
  db: DbOrTx,
  sha256: string,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documentVersions)
    .where(eq(documentVersions.fileSha256, sha256))
  return row?.n ?? 0
}
