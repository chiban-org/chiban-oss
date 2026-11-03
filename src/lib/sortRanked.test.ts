import { describe, expect, it } from 'vitest'
import { sortRanked } from '@/lib/sortRanked'

const rows = [
  { id: 'a', v: '12 Heron' },
  { id: 'b', v: null },
  { id: 'c', v: '2 Birch' },
  { id: 'd', v: '2 Birch' },
]
const ids = (items: { id: string }[]) => items.map((r) => r.id)

describe('sortRanked', () => {
  it('compares numbers inside text and keeps the original order for equal values', () => {
    expect(ids(sortRanked(rows, 'asc', (r) => r.v))).toEqual(['c', 'd', 'a', 'b'])
  })

  it('puts missing values last in both directions and keeps ties in original order', () => {
    expect(ids(sortRanked(rows, 'desc', (r) => r.v))).toEqual(['a', 'c', 'd', 'b'])
  })

  it('compares numeric values', () => {
    const nums = [
      { id: 'x', v: 3 },
      { id: 'y', v: 1 },
    ]
    expect(ids(sortRanked(nums, 'asc', (r) => r.v))).toEqual(['y', 'x'])
  })
})
