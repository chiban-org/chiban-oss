import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { importExceptions } from '@/db/schema'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import type { ImportExceptionKind } from '@/features/gis/exceptionKinds'
import { EXCEPTION_SORT, type ExceptionSortKey } from '@/features/gis/exceptionSort'

export interface ExceptionFilter {
  kind?: ImportExceptionKind
  status?: 'open' | 'accepted' | 'dismissed' | 'resolved_by_rerun'
  sort?: SortState<ExceptionSortKey>
  limit?: number
}

const DEFAULT_LIMIT = 100

const SORT_COLUMNS = {
  newest: importExceptions.createdAt,
  kind: importExceptions.kind,
  row: importExceptions.rowKey,
}

const TIEBREAK: readonly SQL[] = [
  sql`${importExceptions.createdAt} desc`,
  sql`${importExceptions.id} desc`,
]

export async function listExceptions(db: DbOrTx, filter: ExceptionFilter, signal: AbortSignal) {
  signal.throwIfAborted()
  const conditions = []
  if (filter.kind !== undefined) conditions.push(eq(importExceptions.kind, filter.kind))
  if (filter.status !== undefined) conditions.push(eq(importExceptions.status, filter.status))
  return await db
    .select()
    .from(importExceptions)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(...orderBySql(filter.sort ?? defaultSort(EXCEPTION_SORT), SORT_COLUMNS, TIEBREAK))
    .limit(filter.limit ?? DEFAULT_LIMIT)
}
