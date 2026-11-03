import { paramValues, type TableParams } from '@/features/dataTable/params'
import {
  type ChipGroupView,
  chipGroups,
  type FilterGroup,
  type FilterOption,
} from '@/features/dataTable/quickFilters'
import { DIR_PARAM, SORT_PARAM } from '@/features/dataTable/sort'
import type { QueueFacets } from '@/features/queue/queueFacets'
import {
  ASSIGNED_LABELS,
  DUE_LABELS,
  FLAG_LABELS,
  type FlagFilter,
  QUEUE_PATH,
} from '@/features/queue/queueParams'

function counted<V extends string>(
  labels: ReadonlyMap<V, string>,
  counts: ReadonlyMap<V, number>,
): FilterOption[] {
  return [...labels].map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }))
}

export function queueChipGroups(
  params: TableParams,
  facets: QueueFacets,
  showPreservation: boolean,
): ChipGroupView[] {
  const flags = new Map(
    [...FLAG_LABELS].filter(([value]) => showPreservation || value !== 'preservation'),
  ) as ReadonlyMap<FlagFilter, string>
  const groups: FilterGroup[] = [
    { param: 'due', label: 'Deadline', options: counted(DUE_LABELS, facets.due) },
    { param: 'assigned', label: 'Assignment', options: counted(ASSIGNED_LABELS, facets.assigned) },
    { param: 'type', label: 'Type', options: facets.types },
    { param: 'flag', label: 'Money and flags', options: counted(flags, facets.flags) },
  ]
  return chipGroups(QUEUE_PATH, params, groups)
}

const CARRIED = [SORT_PARAM, DIR_PARAM, 'due', 'assigned', 'type', 'flag'] as const

export function carriedParams(params: TableParams): [string, string][] {
  return CARRIED.flatMap((name) =>
    paramValues(params, name).map((value): [string, string] => [name, value]),
  )
}
