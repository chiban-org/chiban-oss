import { describe, expect, it } from 'vitest'
import { aliasSourceText, lineageEventText, retiredText } from '@/features/parcels/parcelText'

describe('parcel text', () => {
  it('writes the lineage event kind and effective date in words', () => {
    expect(lineageEventText('lot_line_adjustment', '2027-04-12')).toBe(
      'lot line adjustment effective April 12, 2027',
    )
  })

  it('writes the retired date in words, or just Retired when unknown', () => {
    expect(retiredText('2027-04-12')).toBe('Retired April 12, 2027')
    expect(retiredText(null)).toBe('Retired')
  })

  it('names where a parcel ID came from in plain words', () => {
    expect(aliasSourceText('import')).toBe('Parcel import')
    expect(aliasSourceText('manual')).toBe('Entered by staff')
    expect(aliasSourceText('override')).toBe('Manual override')
  })
})
