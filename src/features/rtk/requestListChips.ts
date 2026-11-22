import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import { DUE_LABELS } from '@/features/queue/queueParams'
import { RTK_STATUS_LABELS } from '@/features/rtk/labels'
import { type RtkRequestFacets, requestStatusFilters } from '@/features/rtk/requestList'
import { REQUESTS_PATH } from '@/features/rtk/requestListParams'
import { ACKNOWLEDGED_LABEL } from '@/features/rtk/requestStatus'

const LABELS: ReadonlyMap<string, string> = new Map([
  ...Object.entries(RTK_STATUS_LABELS),
  ['acknowledged', ACKNOWLEDGED_LABEL],
])

function statusLabels(): ReadonlyMap<string, string> {
  return new Map(requestStatusFilters().map((value) => [value, LABELS.get(value) ?? value]))
}

export function requestChipGroups(params: TableParams, facets: RtkRequestFacets): ChipGroupView[] {
  return chipGroups(REQUESTS_PATH, params, [
    {
      param: 'status',
      label: 'Status',
      options: labeledOptions(statusLabels(), facets.statuses),
    },
    {
      param: 'due',
      label: 'Deadline',
      single: true,
      options: labeledOptions(DUE_LABELS, facets.due),
    },
  ])
}
