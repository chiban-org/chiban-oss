import { inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents } from '@/db/schema'

export async function notForBoardMessage(
  db: DbOrTx,
  documentIds: string[],
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  const rows =
    documentIds.length === 0
      ? []
      : await db
          .select({ title: documents.title })
          .from(documents)
          .where(inArray(documents.id, documentIds))
  const titles = rows.map((r) => r.title).sort()
  return `These documents cannot go in this packet because they belong to the other board or are not shared with the board or the public: ${titles.join(', ')}.`
}
