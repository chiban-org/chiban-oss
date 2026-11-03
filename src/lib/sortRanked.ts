export type SortDirection = 'asc' | 'desc'

export type SortValue = string | number | null

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b)
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
}

export function sortRanked<T>(
  items: readonly T[],
  dir: SortDirection,
  valueOf: (item: T) => SortValue,
): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return items
    .map((item, rank) => ({ item, rank, value: valueOf(item) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.rank - b.rank
        return a.value === null ? 1 : -1
      }
      return sign * compareValues(a.value, b.value) || a.rank - b.rank
    })
    .map(({ item }) => item)
}
