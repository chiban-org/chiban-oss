import { paramValues, type TableParams } from '@/features/dataTable/params'
import {
  type ChipGroupView,
  type ChipView,
  chipGroups,
  type FilterGroup,
  filterTabs,
  labeledOptions,
} from '@/features/dataTable/quickFilters'
import { DIR_PARAM, SORT_PARAM } from '@/features/dataTable/sort'
import type { QueueFacets } from '@/features/queue/queueFacets'
import {
  APPLICATIONS_PATH,
  ASSIGNED_LABELS,
  DUE_LABELS,
  FLAG_LABELS,
} from '@/features/queue/queueParams'
import {
  DEFAULT_STATUS_TAB,
  STATUS_TAB_LABELS,
  STATUS_TAB_PARAM,
} from '@/features/queue/stateScopes'

export function statusTabs(params: TableParams, facets: QueueFacets): ChipView[] {
  return filterTabs(APPLICATIONS_PATH, params, {
    param: STATUS_TAB_PARAM,
    label: 'Status',
    defaultTab: DEFAULT_STATUS_TAB,
    options: labeledOptions(STATUS_TAB_LABELS, facets.stages),
  })
}

export function queueChipGroups(
  params: TableParams,
  facets: QueueFacets,
  showPreservation: boolean,
): ChipGroupView[] {
  const flags = new Map(
    [...FLAG_LABELS].filter(([value]) => showPreservation || value !== 'preservation'),
  )
  const groups: FilterGroup[] = [
    { param: 'due', label: 'Deadline', options: labeledOptions(DUE_LABELS, facets.due) },
    {
      param: 'assigned',
      label: 'Assignment',
      single: true,
      options: labeledOptions(ASSIGNED_LABELS, facets.assigned),
    },
    { param: 'type', label: 'Type', options: facets.types },
    {
      param: 'flag',
      label: 'Flags',
      options: labeledOptions(flags, facets.flags),
      display: 'menu',
    },
  ]
  return chipGroups(APPLICATIONS_PATH, params, groups)
}

const CARRIED = [
  STATUS_TAB_PARAM,
  SORT_PARAM,
  DIR_PARAM,
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
