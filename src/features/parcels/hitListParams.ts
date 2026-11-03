import {
  firstParam,
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterValues, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import type { MatchedOn } from '@/features/parcels/searchParcels'

export const PARCELS_PATH = '/staff/parcels'

export type HitSortKey = 'relevance' | 'parcel' | 'address' | 'owner' | 'matched'

export const HIT_SORT: SortConfig<HitSortKey> = {
  defaultKey: 'relevance',
  columns: { relevance: 'asc', parcel: 'asc', address: 'asc', owner: 'asc', matched: 'asc' },
}

export const MATCHED_ON_ORDER: readonly MatchedOn[] = [
  'alias_exact',
  'alias_prefix',
  'address',
  'owner',
]

export const MATCH_LABELS: ReadonlyMap<string, string> = new Map([
  ['alias_exact', 'ID match'],
  ['alias_prefix', 'ID starts with'],
  ['address', 'Address'],
  ['owner', 'Owner'],
])

export const PARCEL_STATUSES = ['active', 'retired'] as const
export type ParcelStatus = (typeof PARCEL_STATUSES)[number]

export const STATUS_LABELS: ReadonlyMap<string, string> = new Map([
  ['active', 'Active'],
  ['retired', 'Retired'],
])

export const HIT_FILTER_PARAMS = ['status', 'matched'] as const

export interface HitFilters {
  statuses?: ParcelStatus[]
  matched?: MatchedOn[]
}

export interface HitsView {
  q: string
  params: TableParams
  sort: SortState<HitSortKey>
  filters: HitFilters
}

export function readHitsView(raw: RawSearchParams): HitsView {
  const params = readTableParams(raw)
  return {
    q: firstParam(params, 'q') ?? '',
    params,
    sort: parseSort(HIT_SORT, params),
    filters: {
      ...whenAny('statuses', filterValues(params, 'status', PARCEL_STATUSES)),
      ...whenAny('matched', filterValues(params, 'matched', MATCHED_ON_ORDER)),
    },
  }
}
