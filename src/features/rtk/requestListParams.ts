import { RTK_STATUSES, type RtkStatus } from '@/db/schema'
import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterValues, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { DUE_FILTERS, type DueFilter } from '@/features/queue/queueParams'

export const REQUESTS_PATH = '/staff/records/requests'

export type RequestSortKey = 'number' | 'asked' | 'received' | 'status' | 'due'

export const REQUEST_SORT: SortConfig<RequestSortKey> = {
  defaultKey: 'due',
  columns: { number: 'asc', asked: 'asc', received: 'desc', status: 'asc', due: 'asc' },
}

export const REQUEST_FILTER_PARAMS = ['status', 'due'] as const

export interface RequestListFilters {
  statuses?: RtkStatus[]
  due?: DueFilter[]
}

export interface RequestsView {
  params: TableParams
  sort: SortState<RequestSortKey>
  filters: RequestListFilters
}

export function readRequestsView(raw: RawSearchParams): RequestsView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(REQUEST_SORT, params),
    filters: {
      ...whenAny('statuses', filterValues(params, 'status', RTK_STATUSES)),
      ...whenAny('due', filterValues(params, 'due', DUE_FILTERS)),
    },
  }
}
