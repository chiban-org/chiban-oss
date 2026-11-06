import { and, desc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  documents,
  documentVersions,
  preservationRecords,
  renditionApprovals,
  users,
} from '@/db/schema'
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
  approvedVersionId: string | null
  originalVersionId: string | null
  approvable: { id: string; role: 'original' | 'public_redacted'; createdAt: string }[]
  canRedact: boolean
  preservation: PreservationState
  preservationRecordId: string | null
  series: { key: string; label: string; citation: { label: string; url: string } } | null
  retention: string
  holdCount: number
  uploadedBy: string
}

const PRESERVATION: Record<string, PreservationState> = {
  complete: 'preserved',
  incomplete: 'incomplete',
  not_required: 'not_required',
  pending: 'pending',
}

type RenditionFields = Pick<
  PanelDocument,
  | 'rendition'
  | 'approvalId'
  | 'approvedRole'
  | 'approvedVersionId'
  | 'originalVersionId'
  | 'approvable'
>

function stateOf(
  isPublic: boolean,
  active: boolean,
  hasRedacted: boolean,
  anyRevoked: boolean,
): RenditionState {
  if (active) return 'approved'
  if (isPublic) return 'public_no_copy'
  if (hasRedacted) return 'redacted_waiting'
  return anyRevoked ? 'revoked' : 'none'
}

async function renditionDetails(
  db: DbOrTx,
  ids: string[],
): Promise<(row: DocumentListRow) => RenditionFields> {
  if (ids.length === 0) {
    return () => ({
      rendition: 'none',
      approvalId: null,
      approvedRole: null,
      approvedVersionId: null,
      originalVersionId: null,
      approvable: [],
    })
  }
  const versions = await db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      role: documentVersions.role,
      createdAt: documentVersions.createdAt,
    })
    .from(documentVersions)
    .where(inArray(documentVersions.documentId, ids))
    .orderBy(documentVersions.createdAt)
  const approvals = await db
    .select()
    .from(renditionApprovals)
    .where(
      and(inArray(renditionApprovals.documentId, ids), eq(renditionApprovals.purpose, 'public')),
    )
    .orderBy(desc(renditionApprovals.approvedAt))
  return (row) => {
    const mine = versions.filter((v) => v.documentId === row.documentId)
    const own = approvals.filter((a) => a.documentId === row.documentId)
    const active = own.find((a) => a.revokedAt === null)
    return {
      rendition: stateOf(
        row.isPublic,
        active !== undefined,
        mine.some((v) => v.role === 'public_redacted'),
        own.some((a) => a.revokedAt !== null),
      ),
      approvalId: active?.id ?? null,
      approvedRole: mine.find((v) => v.id === active?.versionId)?.role ?? null,
      approvedVersionId: active?.versionId ?? null,
      originalVersionId: mine.find((v) => v.role === 'original')?.id ?? null,
      approvable: mine.flatMap((v) =>
        v.role === 'original' || v.role === 'public_redacted'
          ? [{ id: v.id, role: v.role, createdAt: v.createdAt.toISOString() }]
          : [],
      ),
    }
  }
}

const SOURCE_NAMES: ReadonlyMap<string, string> = new Map([
  ['system', 'Chiban'],
  ['anonymous_public_intake', 'Public intake'],
])

async function uploaders(db: DbOrTx, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: documents.id, kind: documents.createdByKind, name: users.displayName })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.createdBy))
    .where(inArray(documents.id, ids))
  return new Map(rows.map((r) => [r.id, r.name ?? SOURCE_NAMES.get(r.kind) ?? 'Unknown']))
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
  const [details, uploadedBy] = await Promise.all([renditionDetails(db, ids), uploaders(db, ids)])
  for (const row of listed.rows) {
    const rendition = details(row)
    const rec = records.find((r) => r.documentId === row.documentId)
    const retention = await retentionFor(db, { kind: 'document', id: row.documentId }, signal)
    out.push({
      ...row,
      ...rendition,
      canRedact,
      preservation: PRESERVATION[rec?.status ?? 'not_required'] ?? 'not_required',
      preservationRecordId: rec?.id ?? null,
      series:
        retention === null
          ? null
          : {
              key: retention.series.key,
              label: retention.series.label,
              citation: retention.series.citation,
            },
      retention: retentionText(retention?.status ?? null),
      holdCount: retention?.holds.length ?? 0,
      uploadedBy: uploadedBy.get(row.documentId) ?? 'Unknown',
    })
  }
  return out
}
