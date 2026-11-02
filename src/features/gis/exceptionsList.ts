import { and, desc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { importExceptions } from '@/db/schema'
import type { ImportExceptionKind } from '@/features/gis/exceptionKinds'

export interface ExceptionFilter {
  kind?: ImportExceptionKind
  status?: 'open' | 'accepted' | 'dismissed' | 'resolved_by_rerun'
  limit?: number
}

const DEFAULT_LIMIT = 100

export async function listExceptions(db: DbOrTx, filter: ExceptionFilter, signal: AbortSignal) {
  signal.throwIfAborted()
  const conditions = []
  if (filter.kind !== undefined) conditions.push(eq(importExceptions.kind, filter.kind))
  if (filter.status !== undefined) conditions.push(eq(importExceptions.status, filter.status))
  return await db
    .select()
    .from(importExceptions)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(importExceptions.createdAt), desc(importExceptions.id))
    .limit(filter.limit ?? DEFAULT_LIMIT)
}
