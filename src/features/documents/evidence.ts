import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { auditLog, documents, noticeProofs } from '@/db/schema'
import { EVIDENCE_KINDS } from '@/features/documents/types'

export const LETTER_PRINTED_ACTION = 'letter.printed'

const NOT_A_PRINTED_LETTER = sql`not exists (
  select 1 from ${auditLog}
  where ${auditLog.entityType} = 'document'
    and ${auditLog.entityId} = ${documents.id}::text
    and ${auditLog.action} = ${LETTER_PRINTED_ACTION})`

export function evidenceOf(applicationId: string): SQL {
  return (
    and(
      eq(documents.recordKind, 'application'),
      eq(documents.recordId, applicationId),
      inArray(documents.docKind, [...EVIDENCE_KINDS]),
      NOT_A_PRINTED_LETTER,
    ) ?? sql`false`
  )
}

export async function isPrintedLetter(db: DbOrTx, documentId: string): Promise<boolean> {
  const rows = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'document'),
        eq(auditLog.entityId, documentId),
        eq(auditLog.action, LETTER_PRINTED_ACTION),
      ),
    )
    .limit(1)
  return rows.length > 0
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
