export interface RevisionRow {
  documentId: string
  supersededBy: string | null
}

export interface RevisionGroup<T extends RevisionRow> {
  current: T
  earlier: T[]
}

function headOf<T extends RevisionRow>(row: T, byId: Map<string, T>): T {
  const seen = new Set<string>()
  let at = row
  while (at.supersededBy !== null && !seen.has(at.documentId)) {
    seen.add(at.documentId)
    const next = byId.get(at.supersededBy)
    if (next === undefined) break
    at = next
  }
  return at
}

export function groupRevisions<T extends RevisionRow>(rows: T[]): RevisionGroup<T>[] {
  const byId = new Map(rows.map((r) => [r.documentId, r]))
  const groups = new Map<string, RevisionGroup<T>>()
  for (const row of rows) {
    const head = headOf(row, byId)
    const group = groups.get(head.documentId) ?? { current: head, earlier: [] }
    if (head !== row) group.earlier.push(row)
    groups.set(head.documentId, group)
  }
  return [...groups.values()]
}
