import type { SortState } from '@/features/dataTable/sort'

export type SortValue = string | number | null

export type SortAccessors<T, K extends string> = Readonly<Record<K, ((row: T) => SortValue) | null>>

export const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return COLLATOR.compare(String(a), String(b))
}

export function sortRows<T, K extends string>(
  rows: readonly T[],
  state: SortState<K>,
  accessors: SortAccessors<T, K>,
): T[] {
  const accessor = accessors[state.key]
  if (accessor === null) return [...rows]
  const sign = state.dir === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: accessor(row) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index
        return a.value === null ? 1 : -1
      }
      return sign * compareValues(a.value, b.value) || a.index - b.index
    })
    .map(({ row }) => row)
}
