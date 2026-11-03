import {
  firstParam,
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { singleValue } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { IMPORT_EXCEPTION_KINDS, type ImportExceptionKind } from '@/features/gis/exceptionKinds'
import { EXCEPTION_STATUSES, type ExceptionStatus } from '@/features/gis/exceptionLabels'

export const EXCEPTIONS_PATH = '/staff/gis/exceptions'

export const DEFAULT_EXCEPTION_STATUS: ExceptionStatus = 'open'

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

export interface ExceptionView {
  params: TableParams
  sort: SortState<ExceptionSortKey>
  status: ExceptionStatus
  kind: ImportExceptionKind[]
}

function readStatus(params: TableParams): ExceptionStatus {
  const given = firstParam(params, 'status')
  return EXCEPTION_STATUSES.find((s) => s === given) ?? DEFAULT_EXCEPTION_STATUS
}

export function readExceptionView(raw: RawSearchParams): ExceptionView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(EXCEPTION_SORT, params),
    status: readStatus(params),
    kind: singleValue(params, 'kind', IMPORT_EXCEPTION_KINDS),
  }
}
