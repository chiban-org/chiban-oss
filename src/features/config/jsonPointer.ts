function decode(pointer: string): string[] {
  return pointer
    .split('/')
    .slice(1)
    .map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'))
}

type Container = Record<string, unknown> | unknown[]

function child(container: Container, segment: string): unknown {
  return (container as Record<string, unknown>)[segment]
}

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null
}

export interface PointerChange {
  pointer: string
  value: unknown
}

export function applyPointerChanges(body: unknown, changes: PointerChange[]): unknown {
  const root = { value: structuredClone(body) }
  const removals: { parent: Container; segment: string }[] = []
  for (const change of changes) {
    const segments = ['value', ...decode(change.pointer)]
    let cursor: Container = root
    for (const segment of segments.slice(0, -1)) {
      const next = child(cursor, segment)
      if (!isContainer(next)) throw new TypeError(`no container at ${change.pointer}`)
      cursor = next
    }
    const last = segments[segments.length - 1] ?? ''
    if (change.value === undefined) removals.push({ parent: cursor, segment: last })
    else (cursor as Record<string, unknown>)[last] = change.value
  }
  const ordered = removals.sort((a, b) => Number(b.segment) - Number(a.segment))
  for (const { parent, segment } of ordered) {
    if (Array.isArray(parent)) parent.splice(Number(segment), 1)
    else delete parent[segment]
  }
  return root.value
}
