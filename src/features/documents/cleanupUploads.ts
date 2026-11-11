import { and, inArray, isNull, lt } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { magicLinks, uploadIntents } from '@/db/schema'
import type { ObjectStore } from '@/features/storage/objectStore'

const MINUTE_MS = 60_000
const ABANDONED_GRACE_MS = 60 * MINUTE_MS
const MAGIC_LINK_RETENTION_MS = 24 * 60 * MINUTE_MS
export const CLEANUP_BATCH = 200

export async function cleanupAbandonedUploads(
  db: Db,
  store: ObjectStore,
  now: Date,
  signal: AbortSignal,
): Promise<number> {
  const cutoff = new Date(now.getTime() - ABANDONED_GRACE_MS)
  const stale = await db
    .select({ id: uploadIntents.id, tempKey: uploadIntents.tempKey })
    .from(uploadIntents)
    .where(and(isNull(uploadIntents.finalizedAt), lt(uploadIntents.expiresAt, cutoff)))
    .limit(CLEANUP_BATCH)
  for (const row of stale) {
    signal.throwIfAborted()
    await store.delete(row.tempKey, signal)
  }
  if (stale.length === 0) return 0
  await db.delete(uploadIntents).where(
    and(
      inArray(
        uploadIntents.id,
        stale.map((row) => row.id),
      ),
      isNull(uploadIntents.finalizedAt),
    ),
  )
  return stale.length
}

export async function cleanupExpiredMagicLinks(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - MAGIC_LINK_RETENTION_MS)
  const expired = await db
    .select({ id: magicLinks.id })
    .from(magicLinks)
    .where(lt(magicLinks.expiresAt, cutoff))
    .limit(CLEANUP_BATCH)
  if (expired.length === 0) return 0
  await db.delete(magicLinks).where(
    inArray(
      magicLinks.id,
      expired.map((row) => row.id),
    ),
  )
  return expired.length
}
