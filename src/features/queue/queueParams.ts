import { CORE_STATES, type CoreState, STATE_LABELS } from '@/features/applications/states'
import { isValidConfigKey } from '@/features/config/kinds'
import {
  firstParam,
  PAGE_PARAM,
  paramValues,
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterValues, singleValue, whenAny } from '@/features/dataTable/quickFilters'
import {
  DIR_PARAM,
  parseSort,
  SORT_PARAM,
  type SortConfig,
  type SortState,
} from '@/features/dataTable/sort'
import { readStatusTab, STATUS_TAB_PARAM, statesForTab } from '@/features/queue/stateScopes'
import type { WorkQueueFilters } from '@/features/queue/workQueue'

export const APPLICATIONS_PATH = '/staff/applications'

export type QueueSortKey =
  | 'number'
  | 'project'
  | 'parcel'
  | 'status'
  | 'due'
  | 'fees'
  | 'reviewers'
  | 'received'

export const QUEUE_SORT: SortConfig<QueueSortKey> = {
  defaultKey: 'due',
  columns: {
    number: 'asc',
    project: 'asc',
    parcel: 'asc',
    status: 'asc',
    due: 'asc',
    fees: 'desc',
    reviewers: 'asc',
    received: 'desc',
  },
}

export const DUE_FILTERS = ['overdue', 'week', 'none'] as const
export type DueFilter = (typeof DUE_FILTERS)[number]

export const ASSIGNED_FILTERS = ['me', 'none'] as const
export type AssignedFilter = (typeof ASSIGNED_FILTERS)[number]

export const FLAG_FILTERS = ['fees', 'payment', 'preservation', 'reviewed'] as const
export type FlagFilter = (typeof FLAG_FILTERS)[number]

export const DUE_LABELS: ReadonlyMap<DueFilter, string> = new Map([
  ['overdue', 'Overdue'],
  ['week', 'Due this week'],
  ['none', 'No deadline running'],
])

export const ASSIGNED_LABELS: ReadonlyMap<AssignedFilter, string> = new Map([
  ['me', 'Mine'],
  ['none', 'Unassigned'],
])

export const FLAG_LABELS: ReadonlyMap<FlagFilter, string> = new Map([
  ['fees', 'Fees due'],
  ['payment', 'Payment outcome unknown'],
  ['preservation', 'Preservation incomplete'],
  ['reviewed', 'Reviews back'],
])

export const CORE_STATE_LABELS: ReadonlyMap<CoreState, string> = new Map(
  CORE_STATES.map((state) => [state, STATE_LABELS[state]]),
)

export const QUEUE_FILTER_PARAMS = ['q', 'state', 'due', 'assigned', 'type', 'flag'] as const

export interface QueueView {
  params: TableParams
  sort: SortState<QueueSortKey>
  filters: WorkQueueFilters
}

export function queueFilters(params: TableParams): WorkQueueFilters {
  const states = statesForTab(readStatusTab(params))
  const q = firstParam(params, 'q')
  return {
    ...(states === undefined ? {} : { states }),
    ...(q === undefined ? {} : { numberContains: q }),
    ...whenAny('stateKeys', filterValues(params, 'state', CORE_STATES)),
    ...whenAny('typeKeys', filterValues(params, 'type', isValidConfigKey)),
    ...whenAny('due', singleValue(params, 'due', DUE_FILTERS)),
    ...whenAny('assigned', singleValue(params, 'assigned', ASSIGNED_FILTERS)),
    ...whenAny('flags', filterValues(params, 'flag', FLAG_FILTERS)),
  }
}

export function readQueueView(raw: RawSearchParams): QueueView {
  const params = readTableParams(raw)
  return { params, sort: parseSort(QUEUE_SORT, params), filters: queueFilters(params) }
}

function labelsOf<V extends string>(
  values: readonly V[] | undefined,
  labels: ReadonlyMap<V, string>,
): string[] {
  return (values ?? []).map((value) => labels.get(value) ?? value)
}

export function activeFilterLabels(
  params: TableParams,
  typeLabels: ReadonlyMap<string, string> = new Map(),
): string[] {
  const filters = queueFilters(params)
  const q = firstParam(params, 'q')
  return [
    ...(q === undefined ? [] : [`Number contains ${q}`]),
    ...labelsOf(filters.stateKeys, CORE_STATE_LABELS),
    ...labelsOf(filters.due, DUE_LABELS),
    ...labelsOf(filters.assigned, ASSIGNED_LABELS),
    ...labelsOf(filters.typeKeys, typeLabels),
    ...labelsOf(filters.flags, FLAG_LABELS),
  ]
}

export function filterKey(params: TableParams): string {
  return [SORT_PARAM, DIR_PARAM, PAGE_PARAM, STATUS_TAB_PARAM, ...QUEUE_FILTER_PARAMS]
    .map((name) => paramValues(params, name).join(','))
    .join('|')
}
