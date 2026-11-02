import { and, desc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documentVersions, preservationRecords, renditionApprovals } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { listDocuments } from '@/features/documents/listDocuments'
import type { DocumentListRow, RecordRef } from '@/features/documents/types'
import { retentionFor } from '@/features/records/disposition'
import { retentionText } from '@/features/records/retentionText'

export type PreservationState = 'preserved' | 'incomplete' | 'not_required' | 'pending'

export type RenditionState = 'approved' | 'public_no_copy' | 'redacted_waiting' | 'revoked' | 'none'

export interface PanelDocument extends DocumentListRow {
  rendition: RenditionState
  approvalId: string | null
  approvedRole: string | null
  originalVersionId: string | null
  approvable: { id: string; role: 'original' | 'public_redacted' }[]
  canRedact: boolean
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
  const canRedact = await hasCapability(db, actor.userId, 'redaction.create', signal)
  const versions =
    ids.length === 0
      ? []
      : await db
          .select({
            id: documentVersions.id,
            documentId: documentVersions.documentId,
            role: documentVersions.role,
          })
          .from(documentVersions)
          .where(inArray(documentVersions.documentId, ids))
  const approvals =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(renditionApprovals)
          .where(
            and(
              inArray(renditionApprovals.documentId, ids),
              eq(renditionApprovals.purpose, 'public'),
            ),
          )
          .orderBy(desc(renditionApprovals.approvedAt))
  for (const row of listed.rows) {
    const mine = versions.filter((v) => v.documentId === row.documentId)
    const active = approvals.find((a) => a.documentId === row.documentId && a.revokedAt === null)
    const anyRevoked = approvals.some(
      (a) => a.documentId === row.documentId && a.revokedAt !== null,
    )
    const hasRedacted = mine.some((v) => v.role === 'public_redacted')
    const rendition: RenditionState =
      active !== undefined
        ? 'approved'
        : row.isPublic
          ? 'public_no_copy'
          : hasRedacted
            ? 'redacted_waiting'
            : anyRevoked
              ? 'revoked'
              : 'none'
    const rec = records.find((r) => r.documentId === row.documentId)
    const retention = await retentionFor(db, { kind: 'document', id: row.documentId }, signal)
    out.push({
      ...row,
      rendition,
      approvalId: active?.id ?? null,
      approvedRole: mine.find((v) => v.id === active?.versionId)?.role ?? null,
      originalVersionId: mine.find((v) => v.role === 'original')?.id ?? null,
      approvable: mine.flatMap((v) =>
        v.role === 'original' || v.role === 'public_redacted' ? [{ id: v.id, role: v.role }] : [],
      ),
      canRedact,
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
