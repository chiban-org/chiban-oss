import { describe, expect, it } from 'vitest'
import {
  applicationPublicHref,
  casePublicHref,
  parcelPublicHref,
} from '@/features/publicSite/publicHref'

describe('the public page a staff record opens', () => {
  it('opens the parcel page for an application once it is past draft', () => {
    expect(applicationPublicHref({ state: 'submitted', parcelId: 'p1' })).toBe('/parcels/p1')
    expect(applicationPublicHref({ state: 'draft', parcelId: 'p1' })).toBeNull()
  })

  it('opens the parcel page for a public case with a parcel, and nothing otherwise', () => {
    expect(casePublicHref({ isPublic: true, parcelId: 'p1' })).toBe('/parcels/p1')
    expect(casePublicHref({ isPublic: false, parcelId: 'p1' })).toBeNull()
    expect(casePublicHref({ isPublic: true, parcelId: null })).toBeNull()
  })

  it('opens the public page of the same parcel', () => {
    expect(parcelPublicHref('p1')).toBe('/parcels/p1')
  })
})
