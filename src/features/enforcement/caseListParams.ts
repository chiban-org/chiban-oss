import { ENFORCEMENT_STATUSES, type EnforcementStatus } from '@/db/schema'
import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterValues, singleValue, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import {
  ASSIGNED_FILTERS,
  type AssignedFilter,
  DUE_FILTERS,
  type DueFilter,
} from '@/features/queue/queueParams'

export const CASES_PATH = '/staff/enforcement'

export type CaseSortKey = 'number' | 'where' | 'status' | 'opened' | 'next' | 'stay'

export const CASE_SORT: SortConfig<CaseSortKey> = {
  defaultKey: 'number',
  columns: {
    number: 'desc',
    where: 'asc',
    status: 'asc',
    opened: 'desc',
    next: 'asc',
    stay: 'desc',
  },
}

export const CASE_FILTER_PARAMS = ['status', 'due', 'assigned'] as const

export interface CaseListFilters {
  statuses?: EnforcementStatus[]
  due?: DueFilter[]
  assigned?: AssignedFilter[]
}

export interface CasesView {
  params: TableParams
  sort: SortState<CaseSortKey>
  filters: CaseListFilters
}

export function readCasesView(raw: RawSearchParams): CasesView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(CASE_SORT, params),
    filters: {
      ...whenAny('statuses', filterValues(params, 'status', ENFORCEMENT_STATUSES)),
      ...whenAny('due', filterValues(params, 'due', DUE_FILTERS)),
      ...whenAny('assigned', singleValue(params, 'assigned', ASSIGNED_FILTERS)),
    },
  }
}
