import { and, eq, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applicationDocumentLinks, documents, users } from '@/db/schema'
import type { DocKind } from '@/features/documents/types'

const DECISION_NOTICE_KINDS: readonly DocKind[] = ['attachment', 'board_material']

async function publicUploadIds(db: DbOrTx, applicationId: string): Promise<string[]> {
  const rows = await db
    .select({ documentId: documents.id })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.createdBy))
    .where(
      and(
        eq(documents.recordKind, 'application'),
        eq(documents.recordId, applicationId),
        or(eq(documents.createdByKind, 'anonymous_public_intake'), eq(users.kind, 'public')),
      ),
    )
  return rows.map((r) => r.documentId)
}

export async function notDecisionDocumentIds(
  db: DbOrTx,
  applicationId: string,
): Promise<Set<string>> {
  const [linked, uploaded] = await Promise.all([
    db
      .select({ documentId: applicationDocumentLinks.documentId })
      .from(applicationDocumentLinks)
      .where(eq(applicationDocumentLinks.applicationId, applicationId)),
    publicUploadIds(db, applicationId),
  ])
  return new Set([...linked.map((r) => r.documentId), ...uploaded])
}

export function mayBeDecisionNotice(
  doc: { documentId: string; docKind: DocKind },
  excluded: ReadonlySet<string>,
): boolean {
  return DECISION_NOTICE_KINDS.includes(doc.docKind) && !excluded.has(doc.documentId)
}

export async function decisionNoticeDocuments<T extends { documentId: string; docKind: DocKind }>(
  db: DbOrTx,
  applicationId: string,
  documents: readonly T[],
): Promise<T[]> {
  const excluded = await notDecisionDocumentIds(db, applicationId)
  return documents.filter((d) => mayBeDecisionNotice(d, excluded))
}
