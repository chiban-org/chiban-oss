import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import {
  BATCH_ITEM_KIND_LABELS,
  BATCH_ITEM_RESULT_LABELS,
} from '@/features/disposition/batchItemParams'
import type { BatchItemFacets } from '@/features/disposition/batchItems'

export function batchItemChipGroups(
  path: string,
  params: TableParams,
  facets: BatchItemFacets,
): ChipGroupView[] {
  return chipGroups(path, params, [
    {
      param: 'result',
      label: 'Result',
      options: labeledOptions(BATCH_ITEM_RESULT_LABELS, facets.results),
    },
    { param: 'kind', label: 'Kind', options: labeledOptions(BATCH_ITEM_KIND_LABELS, facets.kinds) },
    { param: 'series', label: 'Retention series', options: facets.series },
  ])
}
