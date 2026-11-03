import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import {
  TOMBSTONE_KIND_LABELS,
  TOMBSTONE_WINDOW_LABELS,
  TOMBSTONES_PATH,
} from '@/features/disposition/tombstoneParams'
import type { TombstoneFacets } from '@/features/disposition/tombstones'

export function tombstoneChipGroups(params: TableParams, facets: TombstoneFacets): ChipGroupView[] {
  return chipGroups(TOMBSTONES_PATH, params, [
    { param: 'kind', label: 'Kind', options: labeledOptions(TOMBSTONE_KIND_LABELS, facets.kinds) },
    {
      param: 'when',
      label: 'Disposed of',
      options: labeledOptions(TOMBSTONE_WINDOW_LABELS, facets.windows),
    },
    { param: 'series', label: 'Retention series', options: facets.series },
  ])
}
