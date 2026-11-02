import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents, noticeProofs } from '@/db/schema'
import { EVIDENCE_KINDS } from '@/features/documents/types'

export function evidenceOf(applicationId: string): SQL {
  return (
    and(
      eq(documents.recordKind, 'application'),
      eq(documents.recordId, applicationId),
      inArray(documents.docKind, [...EVIDENCE_KINDS]),
    ) ?? sql`false`
  )
}

export async function noticeProofDocumentIds(
  db: DbOrTx,
  documentIds: string[],
): Promise<Set<string>> {
  if (documentIds.length === 0) return new Set()
  const rows = await db
    .selectDistinct({ documentId: noticeProofs.documentId })
    .from(noticeProofs)
    .where(inArray(noticeProofs.documentId, documentIds))
  return new Set(rows.map((r) => r.documentId))
}
