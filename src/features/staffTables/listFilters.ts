export interface ListGroup<T> {
  value: (row: T) => string
  selected: readonly string[]
}

export type ListGroups<T, G extends string> = Readonly<Record<G, ListGroup<T>>>

function matches<T, G extends string>(row: T, groups: ListGroups<T, G>, except?: G): boolean {
  return (Object.entries(groups) as [G, ListGroup<T>][]).every(
    ([name, group]) =>
      name === except || group.selected.length === 0 || group.selected.includes(group.value(row)),
  )
}

export function filterRows<T, G extends string>(rows: readonly T[], groups: ListGroups<T, G>): T[] {
  return rows.filter((row) => matches(row, groups))
}

export function countGroups<T, G extends string>(
  rows: readonly T[],
  groups: ListGroups<T, G>,
  options: Readonly<Record<G, readonly string[]>>,
): Map<G, Map<string, number>> {
  const result = new Map<G, Map<string, number>>()
  for (const name of Object.keys(groups) as G[]) {
    const counts = new Map(options[name].map((value): [string, number] => [value, 0]))
    for (const row of rows) {
      if (!matches(row, groups, name)) continue
      const value = groups[name].value(row)
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    result.set(name, counts)
  }
  return result
}
