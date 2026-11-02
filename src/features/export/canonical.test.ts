import { describe, expect, it } from 'vitest'
import { canonicalJson } from '@/features/export/canonical'

describe('canonicalJson', () => {
  it('sorts nested keys at every level', () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: [{ z: 1, y: 2 }] } })
    expect(a).toBe('{"a":{"c":[{"y":2,"z":1}],"d":2},"b":1}')
  })

  it('renders a date column as 2027-03-01 and a timestamp as ISO UTC', () => {
    expect(canonicalJson({ dueOn: '2027-03-01' })).toBe('{"dueOn":"2027-03-01"}')
    expect(canonicalJson({ at: new Date('2027-03-01T05:00:00.000Z') })).toBe(
      '{"at":"2027-03-01T05:00:00.000Z"}',
    )
  })

  it('renders bigint as a decimal string and keeps null', () => {
    expect(canonicalJson({ n: 9007199254740993n, x: null })).toBe(
      '{"n":"9007199254740993","x":null}',
    )
  })

  it('keeps geometry as GeoJSON with sorted keys', () => {
    const geometry = { type: 'Point', coordinates: [1, 2] }
    expect(canonicalJson({ geom: geometry })).toBe('{"geom":{"coordinates":[1,2],"type":"Point"}}')
  })

  it('is identical for the same value built in a different key order', () => {
    expect(canonicalJson({ a: 1, b: { x: 1, y: 2 } })).toBe(
      canonicalJson({ b: { y: 2, x: 1 }, a: 1 }),
    )
  })
})
