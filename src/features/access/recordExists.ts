import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { abutterLists, inspections, reviewAssignments } from '@/db/schema'

const RECORD_TABLES = {
  review: reviewAssignments,
  abutterList: abutterLists,
  inspection: inspections,
} as const

export type ExistingRecordKind = keyof typeof RECORD_TABLES

export async function recordExists(
  db: DbOrTx,
  kind: ExistingRecordKind,
  id: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const table = RECORD_TABLES[kind]
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1)
  return rows.length > 0
}
