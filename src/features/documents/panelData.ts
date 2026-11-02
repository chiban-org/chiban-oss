import { eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documentVersions, preservationRecords } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { listDocuments } from '@/features/documents/listDocuments'
import type { DocumentListRow, RecordRef } from '@/features/documents/types'
import { retentionFor } from '@/features/records/disposition'
import { retentionText } from '@/features/records/retentionText'

export type PreservationState = 'preserved' | 'incomplete' | 'not_required' | 'pending'

export interface PanelDocument extends DocumentListRow {
  preservation: PreservationState
  preservationRecordId: string | null
  series: { label: string; citation: { label: string; url: string } } | null
  retention: string
  holdCount: number
}

const PRESERVATION: Record<string, PreservationState> = {
  complete: 'preserved',
  incomplete: 'incomplete',
  not_required: 'not_required',
  pending: 'pending',
}

export async function loadPanelDocuments(
  db: DbOrTx,
  actor: Actor,
  record: RecordRef,
  signal: AbortSignal,
): Promise<PanelDocument[]> {
  const listed = await listDocuments(db, actor, { record, limit: 100 }, signal)
  const ids = listed.rows.map((r) => r.documentId)
  const records =
    ids.length === 0
      ? []
      : await db
          .select({
            documentId: documentVersions.documentId,
            id: preservationRecords.id,
            status: preservationRecords.status,
          })
          .from(preservationRecords)
          .innerJoin(
            documentVersions,
            eq(documentVersions.id, preservationRecords.originalVersionId),
          )
          .where(inArray(documentVersions.documentId, ids))
  const out: PanelDocument[] = []
  for (const row of listed.rows) {
    const rec = records.find((r) => r.documentId === row.documentId)
    const retention = await retentionFor(db, { kind: 'document', id: row.documentId }, signal)
    out.push({
      ...row,
      preservation: PRESERVATION[rec?.status ?? 'not_required'] ?? 'not_required',
      preservationRecordId: rec?.id ?? null,
      series:
        retention === null
          ? null
          : { label: retention.series.label, citation: retention.series.citation },
      retention: retentionText(retention?.status ?? null),
      holdCount: retention?.holds.length ?? 0,
    })
  }
  return out
}
