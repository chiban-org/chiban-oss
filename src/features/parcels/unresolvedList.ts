import { desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { parcelRecordLinks } from '@/db/schema'

export async function listUnresolvedLinks(db: DbOrTx, signal: AbortSignal) {
  signal.throwIfAborted()
  return await db
    .select()
    .from(parcelRecordLinks)
    .where(eq(parcelRecordLinks.status, 'unresolved'))
    .orderBy(desc(parcelRecordLinks.createdAt))
}
