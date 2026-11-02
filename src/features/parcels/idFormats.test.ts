import { describe, expect, it } from 'vitest'
import { checkIdFormat, type IdFormat, normalizeId } from '@/features/parcels/idFormats'

const cama15: IdFormat = { key: 'cama15', kind: 'digits', width: 15 }
const gis12: IdFormat = { key: 'gis12', kind: 'digits', width: 12 }

describe('parcel id formats', () => {
  it('normalizes punctuation and spaces away', () => {
    expect(normalizeId('007-014 000 000')).toBe('007014000000')
  })

  it('uppercases letters', () => {
    expect(normalizeId('12a-b')).toBe('12AB')
  })

  it('rejects a cama id of the wrong width', () => {
    expect(checkIdFormat(cama15, '7014000000001')).toEqual({
      ok: false,
      error: 'id_format_mismatch',
    })
  })

  it('keeps a gis id as a string with its leading zeros', () => {
    expect(checkIdFormat(gis12, '007014000000')).toEqual({ ok: true, value: '007014000000' })
  })

  it('rejects non-digits in a digits format', () => {
    expect(checkIdFormat(gis12, '00701400000A').ok).toBe(false)
  })
})
