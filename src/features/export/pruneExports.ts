import { and, eq, lt } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { exportsTable } from '@/db/schema'
import type { ObjectStore } from '@/features/storage/objectStore'

export async function pruneExpiredExports(
  db: Db,
  store: ObjectStore,
  now: Date,
  signal: AbortSignal,
): Promise<number> {
  const due = await db
    .select({ id: exportsTable.id, key: exportsTable.storageKey })
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.kind, 'business'),
        eq(exportsTable.status, 'ready'),
        lt(exportsTable.expiresAt, now),
      ),
    )
  for (const row of due) {
    if (row.key !== null) await store.delete(row.key, signal)
    await db.update(exportsTable).set({ status: 'expired' }).where(eq(exportsTable.id, row.id))
  }
  return due.length
}
