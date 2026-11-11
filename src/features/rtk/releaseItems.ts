import { eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  documents,
  documentVersions,
  redactionBoxes,
  renditionApprovals,
  rtkWithholdings,
} from '@/db/schema'
import { err, ok, type Result } from '@/types/result'

const REDACTED_ROLES = ['public_redacted', 'release_redacted']

export interface ResolvedItem {
  documentId: string
  approvalId: string
  versionId: string
  role: string
  redactionJobId: string | null
  title: string
}

export async function resolveItems(
  tx: Tx,
  requestId: string,
  items: { documentId: string; approvalId: string }[],
): Promise<Result<ResolvedItem[], 'approval_missing' | 'approval_revoked'>> {
  const rows = await tx
    .select({
      approvalId: renditionApprovals.id,
      documentId: renditionApprovals.documentId,
      versionId: renditionApprovals.versionId,
      purpose: renditionApprovals.purpose,
      rtkRequestId: renditionApprovals.rtkRequestId,
      revokedAt: renditionApprovals.revokedAt,
      role: documentVersions.role,
      redactionJobId: documentVersions.redactionJobId,
      title: documents.title,
    })
    .from(renditionApprovals)
    .innerJoin(documentVersions, eq(documentVersions.id, renditionApprovals.versionId))
    .innerJoin(documents, eq(documents.id, renditionApprovals.documentId))
    .where(
      inArray(
        renditionApprovals.id,
        items.map((i) => i.approvalId),
      ),
    )
  const resolved: ResolvedItem[] = []
  for (const item of items) {
    const row = rows.find((r) => r.approvalId === item.approvalId)
    const forThisRequest = row?.purpose === 'public' || row?.rtkRequestId === requestId
    if (row === undefined || row.documentId !== item.documentId || !forThisRequest) {
      return err('approval_missing')
    }
    if (row.revokedAt !== null) return err('approval_revoked')
    resolved.push({
      documentId: row.documentId,
      approvalId: row.approvalId,
      versionId: row.versionId,
      role: row.role,
      redactionJobId: row.redactionJobId,
      title: row.title,
    })
  }
  return ok(resolved)
}

export async function withholdingsFor(
  tx: Tx,
  requestId: string,
  releaseId: string,
  actorId: string,
  item: ResolvedItem,
): Promise<boolean> {
  if (!REDACTED_ROLES.includes(item.role)) return true
  if (item.redactionJobId === null) return false
  const boxes = await tx
    .select()
    .from(redactionBoxes)
    .where(eq(redactionBoxes.jobId, item.redactionJobId))
  if (boxes.length === 0) return false
  const groups = new Map<
    string,
    { exemptionKey: string; otherCitation: string | null; explanations: string[] }
  >()
  for (const box of boxes) {
    const key = `${box.exemptionKey}|${box.otherCitation ?? ''}`
    const group = groups.get(key) ?? {
      exemptionKey: box.exemptionKey,
      otherCitation: box.otherCitation,
      explanations: [],
    }
    if (!group.explanations.includes(box.explanation)) group.explanations.push(box.explanation)
    groups.set(key, group)
  }
  await tx.insert(rtkWithholdings).values(
    [...groups.values()].map((g) => ({
      requestId,
      releaseId,
      scope: 'redacted' as const,
      documentId: item.documentId,
      recordDescription: item.title,
      exemptionKey: g.exemptionKey,
      otherCitation: g.otherCitation,
      explanation: g.explanations.join(' '),
      createdBy: actorId,
    })),
  )
  return true
}
