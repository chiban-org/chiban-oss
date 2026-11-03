import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import type { CaseListFacets } from '@/features/enforcement/caseList'
import { CASES_PATH } from '@/features/enforcement/caseListParams'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { ASSIGNED_LABELS, DUE_LABELS } from '@/features/queue/queueParams'

const STATUS_LABELS: ReadonlyMap<string, string> = new Map(Object.entries(CASE_STATUS_LABELS))

export function caseChipGroups(params: TableParams, facets: CaseListFacets): ChipGroupView[] {
  return chipGroups(CASES_PATH, params, [
    { param: 'status', label: 'Status', options: labeledOptions(STATUS_LABELS, facets.statuses) },
    { param: 'due', label: 'Answer deadline', options: labeledOptions(DUE_LABELS, facets.due) },
    {
      param: 'assigned',
      label: 'Assignment',
      options: labeledOptions(ASSIGNED_LABELS, facets.assigned),
    },
  ])
}
