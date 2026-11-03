import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import { DUE_LABELS } from '@/features/queue/queueParams'
import { RTK_STATUS_LABELS } from '@/features/rtk/labels'
import type { RtkRequestFacets } from '@/features/rtk/requestList'
import { REQUESTS_PATH } from '@/features/rtk/requestListParams'

const STATUS_LABELS: ReadonlyMap<string, string> = new Map(Object.entries(RTK_STATUS_LABELS))

export function requestChipGroups(params: TableParams, facets: RtkRequestFacets): ChipGroupView[] {
  return chipGroups(REQUESTS_PATH, params, [
    {
      param: 'status',
      label: 'Status',
      options: labeledOptions(STATUS_LABELS, facets.statuses),
    },
    { param: 'due', label: 'Deadline', options: labeledOptions(DUE_LABELS, facets.due) },
  ])
}
