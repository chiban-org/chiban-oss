import { paramValues, type TableParams } from '@/features/dataTable/params'
import {
  type ChipGroupView,
  type ChipView,
  chipGroups,
  type FilterGroup,
  type FilterOption,
  filterTabs,
  labeledOptions,
} from '@/features/dataTable/quickFilters'
import { DIR_PARAM, SORT_PARAM } from '@/features/dataTable/sort'
import type { QueueFacets } from '@/features/queue/queueFacets'
import {
  APPLICATIONS_PATH,
  ASSIGNED_LABELS,
  CORE_STATE_LABELS,
  DUE_LABELS,
  FLAG_LABELS,
} from '@/features/queue/queueParams'
import {
  DEFAULT_STATUS_TAB,
  STATUS_TAB_LABELS,
  STATUS_TAB_PARAM,
} from '@/features/queue/stateScopes'

export function statusTabs(params: TableParams, facets: QueueFacets): ChipView[] {
  const withoutState = new Map([...params].filter(([name]) => name !== 'state'))
  return filterTabs(APPLICATIONS_PATH, withoutState, {
    param: STATUS_TAB_PARAM,
    label: 'Status',
    defaultTab: DEFAULT_STATUS_TAB,
    options: labeledOptions(STATUS_TAB_LABELS, facets.stages),
  })
}

function stateOptions(params: TableParams, facets: QueueFacets): FilterOption[] {
  const chosen = paramValues(params, 'state')
  return labeledOptions(CORE_STATE_LABELS, facets.states).filter(
    (option) => (option.count ?? 0) > 0 || chosen.includes(option.value),
  )
}

export function queueChipGroups(
  params: TableParams,
  facets: QueueFacets,
  fullRecordAccess: boolean,
): ChipGroupView[] {
  const assigned: FilterGroup = {
    param: 'assigned',
    label: 'Assignment',
    single: true,
    options: labeledOptions(ASSIGNED_LABELS, facets.assigned),
  }
  const flags: FilterGroup = {
    param: 'flag',
    label: 'Flags',
    options: labeledOptions(FLAG_LABELS, facets.flags),
    display: 'menu',
  }
  const groups: FilterGroup[] = [
    {
      param: 'due',
      label: 'Deadline',
      single: true,
      options: labeledOptions(DUE_LABELS, facets.due),
    },
    ...(fullRecordAccess ? [assigned] : []),
    { param: 'type', label: 'Type', options: facets.types },
    { param: 'state', label: 'Status', options: stateOptions(params, facets), display: 'menu' },
  ]
  return chipGroups(APPLICATIONS_PATH, params, fullRecordAccess ? [...groups, flags] : groups)
}

const CARRIED = [
  STATUS_TAB_PARAM,
  SORT_PARAM,
  DIR_PARAM,
  'state',
  'due',
  'assigned',
  'type',
  'flag',
] as const

export function carriedParams(params: TableParams): [string, string][] {
  return CARRIED.flatMap((name) =>
    paramValues(params, name).map((value): [string, string] => [name, value]),
  )
}
