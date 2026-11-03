import { describe, expect, it } from 'vitest'
import { countGroups, filterRows } from '@/features/staffTables/listFilters'

interface Row {
  status: string
  kind: string
}

const ROWS: Row[] = [
  { status: 'open', kind: 'a' },
  { status: 'open', kind: 'b' },
  { status: 'closed', kind: 'a' },
  { status: 'closed', kind: 'c' },
]
const groups = (status: string[], kind: string[]) => ({
  status: { value: (r: Row) => r.status, selected: status },
  kind: { value: (r: Row) => r.kind, selected: kind },
})

describe('list quick filters', () => {
  it('returns every row when nothing is selected', () => {
    expect(filterRows(ROWS, groups([], []))).toHaveLength(4)
  })

  it('ORs values inside a group and ANDs across groups', () => {
    expect(filterRows(ROWS, groups(['open'], ['a', 'b']))).toEqual([ROWS[0], ROWS[1]])
    expect(filterRows(ROWS, groups(['open', 'closed'], ['a']))).toEqual([ROWS[0], ROWS[2]])
  })

  it('counts each group against the other groups only, with zero for absent options', () => {
    const counts = countGroups(ROWS, groups(['open'], []), {
      status: ['open', 'closed', 'void'],
      kind: ['a', 'b', 'c'],
    })
    expect(Object.fromEntries(counts.get('status') ?? [])).toEqual({ open: 2, closed: 2, void: 0 })
    expect(Object.fromEntries(counts.get('kind') ?? [])).toEqual({ a: 1, b: 1, c: 0 })
  })
})
