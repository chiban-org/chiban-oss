import type { CoreState } from '@/features/applications/states'
import { isValidConfigKey } from '@/features/config/kinds'
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

export const APPLICATIONS_PATH = '/staff/applications'

export type ApplicationSortKey = 'newest' | 'number' | 'project' | 'parcel' | 'state' | 'received'

export const APPLICATION_SORT: SortConfig<ApplicationSortKey> = {
  defaultKey: 'newest',
  columns: {
    newest: 'desc',
    number: 'asc',
    project: 'asc',
    parcel: 'asc',
    state: 'asc',
    received: 'desc',
  },
}

export const STATE_GROUPS = ['open', 'issued', 'finished'] as const
export type StateGroup = (typeof STATE_GROUPS)[number]

export const STATE_GROUP_STATES: ReadonlyMap<StateGroup, readonly CoreState[]> = new Map([
  ['open', ['draft', 'submitted', 'under_review', 'decided']],
  ['issued', ['issued', 'suspended']],
  ['finished', ['closed', 'denied', 'withdrawn', 'expired']],
])

export const STATE_GROUP_LABELS: ReadonlyMap<StateGroup, string> = new Map([
  ['open', 'Open'],
  ['issued', 'Issued or suspended'],
  ['finished', 'Closed, denied, withdrawn or expired'],
])

export const APPLICATION_FILTER_PARAMS = ['type', 'stage', 'due', 'assigned'] as const

export interface StaffListFilters {
  typeKeys?: string[]
  stateGroups?: StateGroup[]
  due?: DueFilter[]
  assigned?: AssignedFilter[]
}

export interface ApplicationsView {
  params: TableParams
  sort: SortState<ApplicationSortKey>
  filters: StaffListFilters
}

export function readApplicationsView(raw: RawSearchParams): ApplicationsView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(APPLICATION_SORT, params),
    filters: {
      ...whenAny('typeKeys', filterValues(params, 'type', isValidConfigKey)),
      ...whenAny('stateGroups', filterValues(params, 'stage', STATE_GROUPS)),
      ...whenAny('due', filterValues(params, 'due', DUE_FILTERS)),
      ...whenAny('assigned', singleValue(params, 'assigned', ASSIGNED_FILTERS)),
    },
  }
}
