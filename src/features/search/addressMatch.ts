import type { SearchGroup, SearchGroupKey } from './searchTypes'

function normalAddress(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function sameAddress(address: string | null, query: string): boolean {
  return address !== null && normalAddress(address) === normalAddress(query)
}

export function leadWith(key: SearchGroupKey, groups: readonly SearchGroup[]): SearchGroup[] {
  return [...groups.filter((g) => g.key === key), ...groups.filter((g) => g.key !== key)]
}
