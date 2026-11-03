import type { StaffApplicationFacets } from '@/features/applications/staffList'
import { APPLICATIONS_PATH, STATE_GROUP_LABELS } from '@/features/applications/staffListParams'
import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import { ASSIGNED_LABELS, DUE_LABELS } from '@/features/queue/queueParams'

export function applicationChipGroups(
  params: TableParams,
  facets: StaffApplicationFacets,
): ChipGroupView[] {
  return chipGroups(APPLICATIONS_PATH, params, [
    {
      param: 'stage',
      label: 'Status',
      options: labeledOptions(STATE_GROUP_LABELS, facets.stateGroups),
    },
    { param: 'due', label: 'Deadline', options: labeledOptions(DUE_LABELS, facets.due) },
    {
      param: 'assigned',
      label: 'Assignment',
      options: labeledOptions(ASSIGNED_LABELS, facets.assigned),
    },
    { param: 'type', label: 'Type', options: facets.types },
  ])
}
