import type { Status } from '@/features/design/tokens'

export const GROUP_LIMIT = 5
export const MIN_SEARCH_CHARS = 2
export const MAX_SEARCH_CHARS = 100

export type SearchGroupKey = 'applications' | 'cases' | 'parcels' | 'requests'

export type ExactKind = 'application' | 'case' | 'order' | 'complaint' | 'request' | 'receipt'

export interface SearchRow {
  key: string
  href: string
  title: string
  detail: string
  chip: { status: Status; label: string } | null
  newTab: boolean
}

export interface SearchGroup {
  key: SearchGroupKey
  label: string
  rows: SearchRow[]
  seeAll: { href: string; label: string } | null
}

export interface ExactRecord {
  kind: ExactKind
  number: string
  href: string
  newTab: boolean
}

export interface SearchResult {
  query: string
  exact: ExactRecord | null
  groups: SearchGroup[]
}

export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export function joinDetail(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((p): p is string => p !== null && p !== undefined && p !== '').join(', ')
}
