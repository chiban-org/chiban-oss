import type { SortState } from '@/features/dataTable/sort'
import {
  type HitFilters,
  type HitSortKey,
  MATCHED_ON_ORDER,
  PARCEL_STATUSES,
} from '@/features/parcels/hitListParams'
import type { ParcelSearchHit } from '@/features/parcels/searchParcels'
import { type SortValue, sortRanked } from '@/lib/sortRanked'

export interface HitFacets {
  statuses: ReadonlyMap<string, number>
  matched: ReadonlyMap<string, number>
}

function sortValue(hit: ParcelSearchHit, key: HitSortKey): SortValue {
  switch (key) {
    case 'relevance':
      return 0
    case 'parcel':
      return hit.displayId
    case 'address':
      return hit.siteAddress
    case 'owner':
      return hit.ownerName
    case 'matched':
      return MATCHED_ON_ORDER.indexOf(hit.matchedOn)
  }
}

function matches(hit: ParcelSearchHit, filters: HitFilters, except?: 'statuses' | 'matched') {
  const statuses = filters.statuses ?? []
  const matched = filters.matched ?? []
  const statusOk = except === 'statuses' || statuses.length === 0 || statuses.includes(hit.status)
  const matchedOk = except === 'matched' || matched.length === 0 || matched.includes(hit.matchedOn)
  return statusOk && matchedOk
}

export function arrangeHits(
  hits: readonly ParcelSearchHit[],
  sort: SortState<HitSortKey>,
  filters: HitFilters,
): ParcelSearchHit[] {
  return sortRanked(
    hits.filter((hit) => matches(hit, filters)),
    sort.dir,
    (hit) => sortValue(hit, sort.key),
  )
}

export function hitFacets(hits: readonly ParcelSearchHit[], filters: HitFilters): HitFacets {
  const count = (except: 'statuses' | 'matched', test: (hit: ParcelSearchHit) => boolean) =>
    hits.filter((hit) => matches(hit, filters, except) && test(hit)).length
  return {
    statuses: new Map(
      PARCEL_STATUSES.map((status) => [status, count('statuses', (h) => h.status === status)]),
    ),
    matched: new Map(
      MATCHED_ON_ORDER.map((kind) => [kind, count('matched', (h) => h.matchedOn === kind)]),
    ),
  }
}
