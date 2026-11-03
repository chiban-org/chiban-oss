import { paramValues, type TableParams } from '@/features/dataTable/params'
import {
  type ChipGroupView,
  chipGroups,
  type FilterGroup,
  labeledOptions,
} from '@/features/dataTable/quickFilters'
import { DIR_PARAM, SORT_PARAM } from '@/features/dataTable/sort'
import type { QueueFacets } from '@/features/queue/queueFacets'
import { ASSIGNED_LABELS, DUE_LABELS, FLAG_LABELS, QUEUE_PATH } from '@/features/queue/queueParams'

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
  return chipGroups(QUEUE_PATH, params, groups)
}

const CARRIED = [SORT_PARAM, DIR_PARAM, 'due', 'assigned', 'type', 'flag'] as const

export function carriedParams(params: TableParams): [string, string][] {
  return CARRIED.flatMap((name) =>
    paramValues(params, name).map((value): [string, string] => [name, value]),
  )
}
