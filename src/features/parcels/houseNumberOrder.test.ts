import { describe, expect, it } from 'vitest'
import { byHouseNumber } from '@/features/parcels/houseNumberOrder'
import type { MatchedOn, ParcelSearchHit } from '@/features/parcels/searchParcels'

function hit(siteAddress: string | null, matchedOn: MatchedOn): ParcelSearchHit {
  return {
    parcelId: `${siteAddress}-${matchedOn}`,
    displayId: null,
    status: 'active',
    siteAddress,
    ownerName: null,
    matchedOn,
    matchedAlias: null,
  }
}

const addresses = (hits: ParcelSearchHit[]) => hits.map((h) => h.siteAddress)

describe('ordering parcel search hits by house number', () => {
  it('puts address matches on one street in house-number order, not text order', () => {
    const sorted = byHouseNumber([
      hit('101 Shore Road', 'address'),
      hit('12 Shore Road', 'address'),
      hit('4 Shore Road', 'address'),
      hit('12A Shore Road', 'address'),
    ])
    expect(addresses(sorted)).toEqual([
      '4 Shore Road',
      '12 Shore Road',
      '12A Shore Road',
      '101 Shore Road',
    ])
  })

  it('groups by street before number, and puts an address with no number last on its street', () => {
    const sorted = byHouseNumber([
      hit('9 Shore Road', 'address'),
      hit('Shore Road', 'address'),
      hit('20 Lake Shore Road', 'address'),
      hit('3 Shore Road', 'address'),
    ])
    expect(addresses(sorted)).toEqual([
      '20 Lake Shore Road',
      '3 Shore Road',
      '9 Shore Road',
      'Shore Road',
    ])
  })

  it('keeps ID matches first and owner matches after the address matches, each in their order', () => {
    const sorted = byHouseNumber([
      hit('8 Owner Lane', 'owner'),
      hit('30 Elm Street', 'address'),
      hit('50 Birch Lane', 'alias_exact'),
      hit('2 Elm Street', 'address'),
      hit('1 Owner Lane', 'owner'),
    ])
    expect(addresses(sorted)).toEqual([
      '50 Birch Lane',
      '2 Elm Street',
      '30 Elm Street',
      '8 Owner Lane',
      '1 Owner Lane',
    ])
  })
})
