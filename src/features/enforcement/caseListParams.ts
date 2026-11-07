import type { EnforcementStatus } from '@/db/schema'
import {
  firstParam,
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { singleValue, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import {
  ASSIGNED_FILTERS,
  type AssignedFilter,
  DUE_FILTERS,
  type DueFilter,
} from '@/features/queue/queueParams'

export const CASES_PATH = '/staff/enforcement'

export type CaseSortKey = 'number' | 'where' | 'status' | 'opened' | 'next' | 'stay' | 'assigned'

export const CASE_SORT: SortConfig<CaseSortKey> = {
  defaultKey: 'number',
  columns: {
    number: 'desc',
    where: 'asc',
    status: 'asc',
    opened: 'desc',
    next: 'asc',
    stay: 'desc',
    assigned: 'asc',
  },
}

export const CASE_STAGE_PARAM = 'stage'

export const CASE_STAGES = ['open', 'order', 'court', 'closed', 'all'] as const
export type CaseStage = (typeof CASE_STAGES)[number]

export const DEFAULT_CASE_STAGE: CaseStage = 'open'

export const CASE_STAGE_LABELS: ReadonlyMap<CaseStage, string> = new Map([
  ['open', 'Open'],
  ['order', 'Order issued'],
  ['court', 'In court'],
  ['closed', 'Closed'],
  ['all', 'All'],
])

export const CASE_STAGE_STATUSES: Readonly<Record<CaseStage, readonly EnforcementStatus[]>> = {
  open: ['intake', 'investigating', 'violation_found', 'order_issued', 'in_court'],
  order: ['order_issued'],
  court: ['in_court'],
  closed: ['no_violation', 'resolved', 'closed'],
  all: [],
}

export function readCaseStage(params: TableParams): CaseStage {
  const given = firstParam(params, CASE_STAGE_PARAM)
  return CASE_STAGES.find((stage) => stage === given) ?? DEFAULT_CASE_STAGE
}

export const CASE_FILTER_PARAMS = ['due', 'assigned'] as const

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
      ...whenAny('statuses', [...CASE_STAGE_STATUSES[readCaseStage(params)]]),
      ...whenAny('due', singleValue(params, 'due', DUE_FILTERS)),
      ...whenAny('assigned', singleValue(params, 'assigned', ASSIGNED_FILTERS)),
    },
  }
}
