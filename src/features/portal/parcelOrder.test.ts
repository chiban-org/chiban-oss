import { describe, expect, it } from 'vitest'
import { byHouseNumber } from '@/features/portal/parcelOrder'

describe('byHouseNumber', () => {
  it('orders a street by house number, not as text, with no address last', () => {
    const hits = [
      { siteAddress: '120 Tamarack Way' },
      { siteAddress: null },
      { siteAddress: '12 Tamarack Way' },
      { siteAddress: '9 Tamarack Way' },
      { siteAddress: '4 Alder Pond Road' },
    ]
    expect(byHouseNumber(hits).map((h) => h.siteAddress)).toEqual([
      '4 Alder Pond Road',
      '9 Tamarack Way',
      '12 Tamarack Way',
      '120 Tamarack Way',
      null,
    ])
  })
})
