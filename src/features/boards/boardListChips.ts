import type { BoardFacets } from '@/features/boards/boardApplicationList'
import { BOARDS_PATH } from '@/features/boards/boardListParams'
import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import { DUE_LABELS } from '@/features/queue/queueParams'

export function boardChipGroups(params: TableParams, facets: BoardFacets): ChipGroupView[] {
  return chipGroups(BOARDS_PATH, params, [
    {
      param: 'due',
      label: 'Deadline',
      single: true,
      options: labeledOptions(DUE_LABELS, facets.due),
    },
    { param: 'type', label: 'Type', options: facets.types },
  ])
}
