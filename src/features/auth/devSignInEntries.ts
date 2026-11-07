import { ROLES } from '@/constants/roles'

export interface DevSignInRow {
  email: string
  name: string
  kind: 'staff' | 'public'
  role: string
}

export interface DevSignInEntry {
  email: string
  name: string
  kind: 'staff' | 'public'
  roles: string
  label: string
}

export function devSignInEntries(
  rows: readonly DevSignInRow[],
  boardsByEmail: ReadonlyMap<string, readonly string[]> = new Map(),
): DevSignInEntry[] {
  const byEmail = new Map<string, DevSignInRow[]>()
  for (const row of rows) byEmail.set(row.email, [...(byEmail.get(row.email) ?? []), row])
  return [...byEmail.values()].flatMap((group) => {
    const first = group[0]
    if (first === undefined) return []
    const held = new Set(group.map((r) => r.role))
    const roles = ROLES.filter((r) => held.has(r)).join(', ')
    const labelled = [roles, ...(boardsByEmail.get(first.email) ?? [])].join(', ')
    return [
      {
        email: first.email,
        name: first.name,
        kind: first.kind,
        roles,
        label: `${first.name} (${labelled})`,
      },
    ]
  })
}
