import type { TableParams } from '@/features/dataTable/params'
import {
  type ChipGroupView,
  type ChipView,
  chipGroups,
  filterTabs,
  labeledOptions,
} from '@/features/dataTable/quickFilters'
import type { CaseListFacets } from '@/features/enforcement/caseList'
import {
  CASE_STAGE_LABELS,
  CASE_STAGE_PARAM,
  CASE_STAGE_STATUSES,
  CASE_STAGES,
  CASES_PATH,
  type CaseStage,
  DEFAULT_CASE_STAGE,
} from '@/features/enforcement/caseListParams'
import { ASSIGNED_LABELS, DUE_LABELS } from '@/features/queue/queueParams'

function stageCount(stage: CaseStage, facets: CaseListFacets): number {
  const statuses = CASE_STAGE_STATUSES[stage]
  if (statuses.length === 0) return [...facets.statuses.values()].reduce((a, b) => a + b, 0)
  return statuses.reduce((total, status) => total + (facets.statuses.get(status) ?? 0), 0)
}

export function caseStageTabs(params: TableParams, facets: CaseListFacets): ChipView[] {
  const counts = new Map(CASE_STAGES.map((stage) => [stage, stageCount(stage, facets)]))
  return filterTabs(CASES_PATH, params, {
    param: CASE_STAGE_PARAM,
    label: 'Status',
    defaultTab: DEFAULT_CASE_STAGE,
    options: labeledOptions(CASE_STAGE_LABELS, counts),
  })
}

export function caseChipGroups(params: TableParams, facets: CaseListFacets): ChipGroupView[] {
  return chipGroups(CASES_PATH, params, [
    {
      param: 'due',
      label: 'Deadline',
      single: true,
      options: labeledOptions(DUE_LABELS, facets.due),
    },
    {
      param: 'assigned',
      label: 'Assignment',
      single: true,
      options: labeledOptions(ASSIGNED_LABELS, facets.assigned),
    },
  ])
}
