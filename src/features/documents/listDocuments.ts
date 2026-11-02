import { and, desc, eq, lt, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { Audience, DocKind, DocumentListRow, RecordRef } from '@/features/documents/types'
import { documentVisibleTo } from '@/features/documents/visibility'

function decodeCursor(cursor: string | undefined): number | null {
  if (cursor === undefined) return null
  const seq = Number(cursor)
  return Number.isSafeInteger(seq) ? seq : null
}

export async function listDocuments(
  db: DbOrTx,
  actor: Actor | null,
  input: { record: RecordRef; limit: number; cursor?: string },
  signal: AbortSignal,
): Promise<{ rows: DocumentListRow[]; nextCursor: string | null }> {
  signal.throwIfAborted()
  const after = decodeCursor(input.cursor)
  const rows = await db
    .select({
      seq: documents.seq,
      documentId: documents.id,
      title: documents.title,
      docKind: documents.docKind,
      audiences: documents.audiences,
      isPublic: documents.isPublic,
      createdAt: documents.createdAt,
      hasRedactedCopy: sql<boolean>`exists (
        select 1 from document_versions dv
        where dv.document_id = ${documents.id} and dv.role = 'public_redacted')`,
    })
    .from(documents)
    .where(
      and(
        eq(documents.recordKind, input.record.kind),
        eq(documents.recordId, input.record.id),
        documentVisibleTo(actor),
        after === null ? undefined : lt(documents.seq, after),
      ),
    )
    .orderBy(desc(documents.seq))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  return {
    rows: page.map((r) => ({
      documentId: r.documentId,
      title: r.title,
      docKind: r.docKind,
      audiences: r.audiences as Audience[],
      isPublic: r.isPublic,
      hasRedactedCopy: r.hasRedactedCopy,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: rows.length > input.limit && last !== undefined ? String(last.seq) : null,
  }
}
