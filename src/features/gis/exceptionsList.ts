import { and, eq, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { importExceptions } from '@/db/schema'
import { countFacets, facet } from '@/features/dataTable/facets'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { IMPORT_EXCEPTION_KINDS, type ImportExceptionKind } from '@/features/gis/exceptionKinds'
import { EXCEPTION_STATUSES, type ExceptionStatus } from '@/features/gis/exceptionLabels'
import { EXCEPTION_SORT, type ExceptionSortKey } from '@/features/gis/exceptionSort'

export interface ExceptionFilter {
  kind?: ImportExceptionKind
  status?: ExceptionStatus
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

export interface ExceptionFacets {
  status: ReadonlyMap<string, number>
  kind: ReadonlyMap<string, number>
}

export async function exceptionFacets(
  db: DbOrTx,
  chosen: { status: ExceptionStatus; kind: readonly ImportExceptionKind[] },
  signal: AbortSignal,
): Promise<ExceptionFacets> {
  signal.throwIfAborted()
  const [kind] = chosen.kind
  const kindClause = kind === undefined ? sql`true` : eq(importExceptions.kind, kind)
  const counts = await countFacets(db, {
    table: importExceptions,
    scope: sql`true`,
    others: (group) =>
      group === 'status' ? kindClause : eq(importExceptions.status, chosen.status),
    facets: [
      facet('status', EXCEPTION_STATUSES, (v) => eq(importExceptions.status, v)),
      facet('kind', IMPORT_EXCEPTION_KINDS, (v) => eq(importExceptions.kind, v)),
    ],
  })
  return { status: counts.get('status') ?? new Map(), kind: counts.get('kind') ?? new Map() }
}
