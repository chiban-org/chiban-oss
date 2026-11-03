import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterValues, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'

export type BatchItemSortKey = 'record' | 'kind' | 'series' | 'eligible' | 'result'

export const BATCH_ITEM_SORT: SortConfig<BatchItemSortKey> = {
  defaultKey: 'kind',
  columns: { record: 'asc', kind: 'asc', series: 'asc', eligible: 'asc', result: 'asc' },
}

export const BATCH_ITEM_KINDS = ['document', 'application_snapshot'] as const
export type BatchItemKind = (typeof BATCH_ITEM_KINDS)[number]

export const BATCH_ITEM_KIND_LABELS: ReadonlyMap<BatchItemKind, string> = new Map([
  ['document', 'Document'],
  ['application_snapshot', 'Application snapshot'],
])

export const BATCH_ITEM_RESULTS = [
  'disposed',
  'skipped_hold',
  'skipped_not_eligible',
  'pending',
] as const
export type BatchItemResult = (typeof BATCH_ITEM_RESULTS)[number]

export const BATCH_ITEM_RESULT_LABELS: ReadonlyMap<BatchItemResult, string> = new Map([
  ['disposed', 'Disposed of'],
  ['skipped_hold', 'Skipped for a legal hold'],
  ['skipped_not_eligible', 'Skipped, no longer eligible'],
  ['pending', 'Not yet carried out'],
])

export const BATCH_ITEM_FILTER_PARAMS = ['kind', 'result', 'series'] as const

export interface BatchItemFilters {
  kinds?: BatchItemKind[]
  results?: BatchItemResult[]
  seriesKeys?: string[]
}

export interface BatchItemView {
  params: TableParams
  sort: SortState<BatchItemSortKey>
  filters: BatchItemFilters
}

export function readBatchItemView(raw: RawSearchParams): BatchItemView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(BATCH_ITEM_SORT, params),
    filters: {
      ...whenAny('kinds', filterValues(params, 'kind', BATCH_ITEM_KINDS)),
      ...whenAny('results', filterValues(params, 'result', BATCH_ITEM_RESULTS)),
      ...whenAny(
        'seriesKeys',
        filterValues(params, 'series', () => true),
      ),
    },
  }
}
