import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applicationDocumentLinks } from '@/db/schema'
import type { DocKind } from '@/features/documents/types'

const DECISION_NOTICE_KINDS: readonly DocKind[] = ['attachment', 'board_material']

export async function checklistDocumentIds(
  db: DbOrTx,
  applicationId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ documentId: applicationDocumentLinks.documentId })
    .from(applicationDocumentLinks)
    .where(eq(applicationDocumentLinks.applicationId, applicationId))
  return new Set(rows.map((r) => r.documentId))
}

export function mayBeDecisionNotice(
  doc: { documentId: string; docKind: DocKind },
  filedOnChecklist: ReadonlySet<string>,
): boolean {
  return DECISION_NOTICE_KINDS.includes(doc.docKind) && !filedOnChecklist.has(doc.documentId)
}

export async function decisionNoticeDocuments<T extends { documentId: string; docKind: DocKind }>(
  db: DbOrTx,
  applicationId: string,
  documents: readonly T[],
): Promise<T[]> {
  const filed = await checklistDocumentIds(db, applicationId)
  return documents.filter((d) => mayBeDecisionNotice(d, filed))
}
