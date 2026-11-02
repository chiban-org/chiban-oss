import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents, type InspectionRow, inspectionItemResults, inspections } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { documentVisibleTo } from '@/features/documents/visibility'
import { inspectionVisibleTo } from '@/features/inspections/visibility'

export interface InspectionHistoryItem {
  itemKey: string
  label: string
  required: boolean
  outcome: 'pass' | 'fail' | 'na'
  note: string | null
}

export interface InspectionHistoryRow extends InspectionRow {
  items: InspectionHistoryItem[]
  photoCount: number
}

export async function listInspectionHistory(
  db: DbOrTx,
  actor: Actor | null,
  applicationId: string,
  signal: AbortSignal,
): Promise<InspectionHistoryRow[]> {
  signal.throwIfAborted()
  const rows = await db
    .select()
    .from(inspections)
    .where(and(eq(inspections.applicationId, applicationId), inspectionVisibleTo(actor)))
    .orderBy(asc(inspections.requestedAt), asc(inspections.id))
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const items = await db
    .select()
    .from(inspectionItemResults)
    .where(inArray(inspectionItemResults.inspectionId, ids))
  const photos = await db
    .select({ id: documents.recordId, n: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.recordKind, 'inspection'),
        inArray(documents.recordId, ids),
        documentVisibleTo(actor),
      ),
    )
    .groupBy(documents.recordId)
  return rows.map((row) => ({
    ...row,
    items: items
      .filter((i) => i.inspectionId === row.id)
      .map((i) => ({
        itemKey: i.itemKey,
        label: i.labelSnapshot,
        required: i.required,
        outcome: i.outcome,
        note: i.note,
      })),
    photoCount: photos.find((p) => p.id === row.id)?.n ?? 0,
  }))
}
