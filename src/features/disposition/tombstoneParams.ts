import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterValues, singleValue, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'

export const TOMBSTONES_PATH = '/staff/records/disposed'

export type TombstoneSortKey = 'record' | 'kind' | 'series' | 'disposed' | 'proposer' | 'approver'

export const TOMBSTONE_SORT: SortConfig<TombstoneSortKey> = {
  defaultKey: 'disposed',
  columns: {
    record: 'asc',
    kind: 'asc',
    series: 'asc',
    disposed: 'desc',
    proposer: 'asc',
    approver: 'asc',
  },
}

export const TOMBSTONE_KINDS = ['document', 'application_snapshot'] as const
export type TombstoneKind = (typeof TOMBSTONE_KINDS)[number]

export const TOMBSTONE_KIND_LABELS: ReadonlyMap<TombstoneKind, string> = new Map([
  ['document', 'Document'],
  ['application_snapshot', 'Application snapshot'],
])

export const TOMBSTONE_WINDOWS = ['recent', 'older'] as const
export type TombstoneWindow = (typeof TOMBSTONE_WINDOWS)[number]

export const TOMBSTONE_WINDOW_LABELS: ReadonlyMap<TombstoneWindow, string> = new Map([
  ['recent', 'Last 30 days'],
  ['older', 'Earlier'],
])

export const TOMBSTONE_FILTER_PARAMS = ['kind', 'when', 'series'] as const

export interface TombstoneFilters {
  kinds?: TombstoneKind[]
  windows?: TombstoneWindow[]
  seriesKeys?: string[]
}

export interface TombstoneView {
  params: TableParams
  sort: SortState<TombstoneSortKey>
  filters: TombstoneFilters
}

export function readTombstoneView(raw: RawSearchParams): TombstoneView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(TOMBSTONE_SORT, params),
    filters: {
      ...whenAny('kinds', filterValues(params, 'kind', TOMBSTONE_KINDS)),
      ...whenAny('windows', singleValue(params, 'when', TOMBSTONE_WINDOWS)),
      ...whenAny(
        'seriesKeys',
        filterValues(params, 'series', () => true),
      ),
    },
  }
}
