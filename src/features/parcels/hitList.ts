import type { SortState } from '@/features/dataTable/sort'
import {
  type HitFilters,
  type HitSortKey,
  MATCHED_ON_ORDER,
  PARCEL_STATUSES,
} from '@/features/parcels/hitListParams'
import type { ParcelSearchHit } from '@/features/parcels/searchParcels'

export interface HitFacets {
  statuses: ReadonlyMap<string, number>
  matched: ReadonlyMap<string, number>
}

type Keyed = string | number | null

function sortKey(hit: ParcelSearchHit, key: HitSortKey): Keyed {
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

function compareKeys(a: string | number, b: string | number): number {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b)
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
}

function compareHits(
  state: SortState<HitSortKey>,
): (
  a: { hit: ParcelSearchHit; rank: number },
  b: { hit: ParcelSearchHit; rank: number },
) => number {
  const sign = state.dir === 'asc' ? 1 : -1
  return (a, b) => {
    const left = sortKey(a.hit, state.key)
    const right = sortKey(b.hit, state.key)
    if (left === null && right !== null) return 1
    if (right === null && left !== null) return -1
    const order = left === null || right === null ? 0 : sign * compareKeys(left, right)
    return order === 0 ? a.rank - b.rank : order
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
  return hits
    .map((hit, rank) => ({ hit, rank }))
    .filter(({ hit }) => matches(hit, filters))
    .sort(compareHits(sort))
    .map(({ hit }) => hit)
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
