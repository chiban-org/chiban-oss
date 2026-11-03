import { describe, expect, it } from 'vitest'
import { arrangeHits, hitFacets } from '@/features/parcels/hitList'
import type { HitSortKey } from '@/features/parcels/hitListParams'
import type { MatchedOn, ParcelSearchHit } from '@/features/parcels/searchParcels'

function hit(
  parcelId: string,
  patch: Partial<ParcelSearchHit> & { matchedOn?: MatchedOn } = {},
): ParcelSearchHit {
  return {
    parcelId,
    displayId: null,
    status: 'active',
    siteAddress: null,
    ownerName: null,
    matchedOn: 'address',
    matchedAlias: null,
    ...patch,
  }
}

const ranked = [
  hit('a', {
    displayId: '009',
    siteAddress: '12 Heron Cove',
    ownerName: 'Wren',
    matchedOn: 'alias_exact',
  }),
  hit('b', {
    displayId: '007',
    siteAddress: '40 Alder Pond',
    ownerName: null,
    matchedOn: 'address',
  }),
  hit('c', {
    displayId: null,
    siteAddress: '2 Birch Lane',
    ownerName: 'Marsh',
    status: 'retired',
    matchedOn: 'owner',
  }),
  hit('d', { displayId: '008', siteAddress: null, ownerName: 'Marsh', matchedOn: 'address' }),
]
const ids = (hits: ParcelSearchHit[]) => hits.map((h) => h.parcelId)
const by = (key: HitSortKey, dir: 'asc' | 'desc') => ({ key, dir })

describe('parcel hit sorting', () => {
  it('keeps relevance order by default', () => {
    expect(ids(arrangeHits(ranked, by('relevance', 'asc'), {}))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('sorts by parcel id with a missing id last both ways', () => {
    expect(ids(arrangeHits(ranked, by('parcel', 'asc'), {}))).toEqual(['b', 'd', 'a', 'c'])
    expect(ids(arrangeHits(ranked, by('parcel', 'desc'), {}))).toEqual(['a', 'd', 'b', 'c'])
  })

  it('sorts by address numerically inside the text with a missing address last', () => {
    expect(ids(arrangeHits(ranked, by('address', 'asc'), {}))).toEqual(['c', 'a', 'b', 'd'])
  })

  it('breaks owner ties by relevance rank in either direction', () => {
    expect(ids(arrangeHits(ranked, by('owner', 'asc'), {}))).toEqual(['c', 'd', 'a', 'b'])
    expect(ids(arrangeHits(ranked, by('owner', 'desc'), {}))).toEqual(['a', 'c', 'd', 'b'])
  })

  it('sorts by what the hit matched on in the order the ranking uses', () => {
    expect(ids(arrangeHits(ranked, by('matched', 'asc'), {}))).toEqual(['a', 'b', 'd', 'c'])
    expect(ids(arrangeHits(ranked, by('matched', 'desc'), {}))).toEqual(['c', 'b', 'd', 'a'])
  })
})

describe('parcel hit quick filters', () => {
  it('filters by status', () => {
    expect(ids(arrangeHits(ranked, by('relevance', 'asc'), { statuses: ['retired'] }))).toEqual([
      'c',
    ])
  })

  it('filters by what the hit matched on and ORs values inside the group', () => {
    expect(ids(arrangeHits(ranked, by('relevance', 'asc'), { matched: ['address'] }))).toEqual([
      'b',
      'd',
    ])
    expect(
      ids(arrangeHits(ranked, by('relevance', 'asc'), { matched: ['address', 'owner'] })),
    ).toEqual(['b', 'c', 'd'])
  })

  it('ANDs the two groups', () => {
    expect(
      ids(
        arrangeHits(ranked, by('relevance', 'asc'), {
          statuses: ['retired'],
          matched: ['address'],
        }),
      ),
    ).toEqual([])
  })

  it('counts each chip with the other group applied', () => {
    const all = hitFacets(ranked, {})
    expect(all.statuses.get('retired')).toBe(1)
    expect(all.matched.get('address')).toBe(2)
    expect(all.matched.get('alias_prefix')).toBe(0)
    const narrowed = hitFacets(ranked, { statuses: ['retired'] })
    expect(narrowed.matched.get('address')).toBe(0)
    expect(narrowed.matched.get('owner')).toBe(1)
    expect(narrowed.statuses.get('active')).toBe(3)
  })
})
