import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'

export const EXCEPTIONS_PATH = '/staff/gis/exceptions'

export type ExceptionSortKey = 'newest' | 'kind' | 'row'

export const EXCEPTION_SORT: SortConfig<ExceptionSortKey> = {
  defaultKey: 'newest',
  columns: { newest: 'desc', kind: 'asc', row: 'asc' },
}

export const EXCEPTION_SORT_LABELS: Readonly<Record<ExceptionSortKey, string>> = {
  newest: 'Newest',
  kind: 'Kind',
  row: 'Row',
}

export function readExceptionSort(raw: RawSearchParams): {
  params: TableParams
  sort: SortState<ExceptionSortKey>
} {
  const params = readTableParams(raw)
  return { params, sort: parseSort(EXCEPTION_SORT, params) }
}
