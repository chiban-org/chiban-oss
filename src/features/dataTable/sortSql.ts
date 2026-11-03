import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { SortState } from '@/features/dataTable/sort'

export function orderBySql<K extends string>(
  state: SortState<K>,
  columns: Readonly<Record<K, SQLWrapper>>,
  tiebreak: readonly SQL[],
): SQL[] {
  const direction = state.dir === 'asc' ? sql`asc` : sql`desc`
  const column = new Map(Object.entries(columns) as [K, SQLWrapper][]).get(state.key)
  return column === undefined
    ? [...tiebreak]
    : [sql`${column} ${direction} nulls last`, ...tiebreak]
}
