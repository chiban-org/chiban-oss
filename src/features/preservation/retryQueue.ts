import { and, asc, eq, gt } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents, documentVersions, preservationRecords } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

const RETRY_LIST_LIMIT = 50

export interface RetryingRow {
  recordId: string
  documentId: string
  title: string
  attempts: number
}

export async function listPreservationRetrying(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<RetryingRow[], 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const rows = await db
    .select({
      recordId: preservationRecords.id,
      documentId: documents.id,
      title: documents.title,
      attempts: preservationRecords.attempts,
    })
    .from(preservationRecords)
    .innerJoin(documentVersions, eq(documentVersions.id, preservationRecords.originalVersionId))
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(and(eq(preservationRecords.status, 'pending'), gt(preservationRecords.attempts, 0)))
    .orderBy(asc(preservationRecords.updatedAt))
    .limit(RETRY_LIST_LIMIT)
  return ok(rows)
}
