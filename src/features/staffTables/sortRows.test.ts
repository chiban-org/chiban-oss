import { describe, expect, it } from 'vitest'
import { sortRows } from '@/features/staffTables/sortRows'

interface Row {
  name: string
  n: number | null
}

const ROWS: Row[] = [
  { name: 'b', n: 2 },
  { name: 'a', n: null },
  { name: 'c', n: 10 },
  { name: 'd', n: 2 },
]
const KEYS = { source: null, name: (r: Row) => r.name, n: (r: Row) => r.n }

describe('sortRows', () => {
  it('keeps source order for a null accessor', () => {
    expect(sortRows(ROWS, { key: 'source', dir: 'asc' }, KEYS).map((r) => r.name)).toEqual([
      'b',
      'a',
      'c',
      'd',
    ])
  })

  it('sorts numbers ascending with ties in source order and empties last', () => {
    expect(sortRows(ROWS, { key: 'n', dir: 'asc' }, KEYS).map((r) => r.name)).toEqual([
      'b',
      'd',
      'c',
      'a',
    ])
  })

  it('sorts descending with empties still last', () => {
    expect(sortRows(ROWS, { key: 'n', dir: 'desc' }, KEYS).map((r) => r.name)).toEqual([
      'c',
      'b',
      'd',
      'a',
    ])
  })

  it('compares text without regard to case and numbers inside it naturally', () => {
    const rows = [
      { name: 'Item 10', n: 1 },
      { name: 'item 2', n: 1 },
      { name: 'Alpha', n: 1 },
    ]
    expect(sortRows(rows, { key: 'name', dir: 'asc' }, KEYS).map((r) => r.name)).toEqual([
      'Alpha',
      'item 2',
      'Item 10',
    ])
  })

  it('does not mutate its input', () => {
    const copy = [...ROWS]
    sortRows(ROWS, { key: 'n', dir: 'desc' }, KEYS)
    expect(ROWS).toEqual(copy)
  })
})
