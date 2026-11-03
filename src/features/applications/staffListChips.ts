import type { StaffApplicationFacets } from '@/features/applications/staffList'
import { APPLICATIONS_PATH, STATE_GROUP_LABELS } from '@/features/applications/staffListParams'
import type { TableParams } from '@/features/dataTable/params'
import {
  type ChipGroupView,
  type ChipView,
  chipGroups,
  filterTabs,
  labeledOptions,
} from '@/features/dataTable/quickFilters'
import { ASSIGNED_LABELS, DUE_LABELS } from '@/features/queue/queueParams'

export function applicationStatusTabs(
  params: TableParams,
  facets: StaffApplicationFacets,
): ChipView[] {
  return filterTabs(APPLICATIONS_PATH, params, {
    param: 'stage',
    label: 'Status',
    options: labeledOptions(STATE_GROUP_LABELS, facets.stateGroups),
  })
}

export function applicationChipGroups(
  params: TableParams,
  facets: StaffApplicationFacets,
): ChipGroupView[] {
  return chipGroups(APPLICATIONS_PATH, params, [
    { param: 'due', label: 'Deadline', options: labeledOptions(DUE_LABELS, facets.due) },
    {
      param: 'assigned',
      label: 'Assignment',
      single: true,
      options: labeledOptions(ASSIGNED_LABELS, facets.assigned),
    },
    { param: 'type', label: 'Type', options: facets.types },
  ])
}
