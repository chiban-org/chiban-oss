import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import type { HitFacets } from '@/features/parcels/hitList'
import { MATCH_LABELS, PARCELS_PATH, STATUS_LABELS } from '@/features/parcels/hitListParams'

export function hitChipGroups(params: TableParams, facets: HitFacets): ChipGroupView[] {
  return chipGroups(PARCELS_PATH, params, [
    { param: 'status', label: 'Parcel', options: labeledOptions(STATUS_LABELS, facets.statuses) },
    {
      param: 'matched',
      label: 'Matched on',
      options: labeledOptions(MATCH_LABELS, facets.matched),
    },
  ])
}
