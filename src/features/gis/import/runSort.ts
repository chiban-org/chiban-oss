import { desc } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { importRuns } from '@/db/schema'
import { labelOrderSql } from '@/features/dataTable/labelOrderSql'
import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { LAYER_ADAPTERS, LAYER_KEYS } from '@/features/gis/exceptionKinds'
import { adapterLabel, layerLabel } from '@/features/gis/import/runText'

export const IMPORTS_PATH = '/staff/gis/imports'

export const RECENT_RUN_LIMIT = 20

export type RunSortKey = 'started' | 'layer' | 'source' | 'status'

export const RUN_SORT: SortConfig<RunSortKey> = {
  defaultKey: 'started',
  columns: { started: 'desc', layer: 'asc', source: 'asc', status: 'asc' },
}

const RUN_SORT_COLUMNS = {
  started: importRuns.startedAt,
  layer: labelOrderSql(importRuns.layerKey, LAYER_KEYS, layerLabel),
  source: labelOrderSql(importRuns.adapter, LAYER_ADAPTERS, adapterLabel),
  status: importRuns.status,
}

export function readRunView(raw: RawSearchParams): {
  params: TableParams
  sort: SortState<RunSortKey>
} {
  const params = readTableParams(raw)
  return { params, sort: parseSort(RUN_SORT, params) }
}

export async function listRecentRuns(db: DbOrTx, sort: SortState<RunSortKey>, signal: AbortSignal) {
  signal.throwIfAborted()
  return await db
    .select()
    .from(importRuns)
    .orderBy(
      ...orderBySql(sort, RUN_SORT_COLUMNS, [desc(importRuns.startedAt), desc(importRuns.id)]),
    )
    .limit(RECENT_RUN_LIMIT)
}
