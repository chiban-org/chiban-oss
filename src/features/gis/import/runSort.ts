import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { adapterLabel, layerLabel } from '@/features/gis/import/runText'
import { sortRows } from '@/features/staffTables/sortRows'
import { words } from '@/lib/words'

export const IMPORTS_PATH = '/staff/gis/imports'

export type RunSortKey = 'started' | 'layer' | 'source' | 'status'

export const RUN_SORT: SortConfig<RunSortKey> = {
  defaultKey: 'started',
  columns: { started: 'desc', layer: 'asc', source: 'asc', status: 'asc' },
}

export interface SortableRun {
  startedAt: Date
  layerKey: string
  adapter: string
  status: string
}

export function readRunView(raw: RawSearchParams): {
  params: TableParams
  sort: SortState<RunSortKey>
} {
  const params = readTableParams(raw)
  return { params, sort: parseSort(RUN_SORT, params) }
}

export function sortRuns<T extends SortableRun>(runs: readonly T[], sort: SortState<RunSortKey>) {
  return sortRows(runs, sort, {
    started: (r) => r.startedAt.getTime(),
    layer: (r) => layerLabel(r.layerKey),
    source: (r) => adapterLabel(r.adapter),
    status: (r) => words(r.status),
  })
}
