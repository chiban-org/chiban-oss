import { type PageWindow, slicePage } from '@/features/dataTable/pageSlice'
import type { SortState } from '@/features/dataTable/sort'
import type { ContactSortKey, ContactsQuery } from '@/features/rosters/contactListParams'
import { CONTACTS_PAGE_SIZE } from '@/features/rosters/contactListParams'

export interface ContactItem {
  id: string
  name: string
  parcel: string
  searchText: string
  active: boolean
  due: boolean
  checked: string | null
}

export type FilterQuery = Pick<ContactsQuery, 'search' | 'status' | 'due' | 'entry'>

const compactOf = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

export function searchTextOf(parts: readonly (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => typeof p === 'string' && p !== '')
    .join(' ')
    .toLowerCase()
}

export function matchesSearch(searchText: string, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const compact = compactOf(searchText)
  return words.every((word) => {
    if (searchText.includes(word)) return true
    const bare = compactOf(word)
    return bare !== '' && compact.includes(bare)
  })
}

export function filterItems<T extends ContactItem>(items: readonly T[], query: FilterQuery): T[] {
  if (query.entry !== null) return items.filter((item) => item.id === query.entry)
  return items.filter(
    (item) =>
      item.active === (query.status === 'active') &&
      (!query.due || item.due) &&
      matchesSearch(item.searchText, query.search),
  )
}

const text = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' })
const natural = (a: string, b: string) =>
  a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })

function checkedOrder(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return -1
  if (b === null) return 1
  return a < b ? -1 : 1
}

const KEYED: Record<ContactSortKey, (a: ContactItem, b: ContactItem) => number> = {
  name: (a, b) => text(a.name, b.name),
  parcel: (a, b) => natural(a.parcel, b.parcel),
  checked: (a, b) => checkedOrder(a.checked, b.checked),
}

export function sortItems<T extends ContactItem>(
  items: readonly T[],
  sort: SortState<ContactSortKey>,
): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  const primary = KEYED[sort.key]
  return [...items].sort(
    (a, b) =>
      sign * primary(a, b) ||
      text(a.name, b.name) ||
      natural(a.parcel, b.parcel) ||
      a.id.localeCompare(b.id),
  )
}

export function pageOfItems<T extends ContactItem>(
  items: readonly T[],
  query: FilterQuery & Pick<ContactsQuery, 'sort' | 'offset'>,
): PageWindow & { rows: T[] } {
  return slicePage(
    sortItems(filterItems(items, query), query.sort),
    query.offset,
    CONTACTS_PAGE_SIZE,
  )
}

export interface KindCounts {
  active: number
  ended: number
  due: number
}

export function countItems(items: readonly ContactItem[], search: string): KindCounts {
  const counts = { active: 0, ended: 0, due: 0 }
  for (const item of items) {
    if (!matchesSearch(item.searchText, search)) continue
    if (item.active) counts.active += 1
    else counts.ended += 1
    if (item.due) counts.due += 1
  }
  return counts
}
