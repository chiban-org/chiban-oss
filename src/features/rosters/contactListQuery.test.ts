import { describe, expect, it } from 'vitest'
import { readContactsQuery, tabHref } from '@/features/rosters/contactListParams'
import {
  type ContactItem,
  countItems,
  filterItems,
  matchesSearch,
  pageOfItems,
  searchTextOf,
  sortItems,
} from '@/features/rosters/contactListQuery'

function item(patch: Partial<ContactItem> & { id: string }): ContactItem {
  return {
    name: `Entry ${patch.id}`,
    parcel: '010-001',
    searchText: '',
    active: true,
    due: false,
    checked: '2026-10-01',
    ...patch,
  }
}

const base = { search: '', status: 'active' as const, due: false, entry: null }
const byName = { key: 'name' as const, dir: 'asc' as const }

describe('reading the notice contacts query', () => {
  it('opens on active associations sorted by name, first page', () => {
    expect(readContactsQuery({}).query).toEqual({
      tab: 'associations',
      search: '',
      status: 'active',
      due: false,
      entry: null,
      sort: byName,
      offset: 0,
    })
  })

  it('reads the tab, search, ended, due, sort and page', () => {
    const { query } = readContactsQuery({
      kind: 'holders',
      q: '  Heron ',
      status: 'ended',
      due: 'yes',
      sort: 'checked',
      dir: 'desc',
      cursor: '25',
    })
    expect(query).toMatchObject({
      tab: 'holders',
      search: 'Heron',
      status: 'ended',
      due: true,
      sort: { key: 'checked', dir: 'desc' },
      offset: 25,
    })
  })

  it('falls back to associations for an unknown tab and when Add association is asked for', () => {
    expect(readContactsQuery({ kind: 'nope' }).query.tab).toBe('associations')
    expect(readContactsQuery({ kind: 'parks', add: 'association' }).query.tab).toBe('associations')
  })

  it('keeps a linked entry only when it is a record id', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(readContactsQuery({ entry: id }).query.entry).toBe(id)
    expect(readContactsQuery({ entry: 'x' }).query.entry).toBeNull()
  })

  it('links each tab, leaving the default tab without a kind', () => {
    expect(tabHref('associations')).toBe('/staff/notice-contacts')
    expect(tabHref('parks', { due: 'yes' })).toBe('/staff/notice-contacts?kind=parks&due=yes')
  })
})

describe('searching notice contacts', () => {
  const text = searchTextOf(['Heron Landing', '021-004', '14 Pond Road', null])

  it('matches any word of the name, the parcel ID with or without dashes, and the address', () => {
    expect(matchesSearch(text, 'heron')).toBe(true)
    expect(matchesSearch(text, '021004')).toBe(true)
    expect(matchesSearch(text, '021-004')).toBe(true)
    expect(matchesSearch(text, 'pond road')).toBe(true)
    expect(matchesSearch(text, 'heron marsh')).toBe(false)
  })

  it('matches everything when the search is blank', () => {
    expect(matchesSearch(text, '')).toBe(true)
  })
})

describe('filtering notice contacts', () => {
  const items = [
    item({ id: 'a', searchText: 'heron', due: true }),
    item({ id: 'b', searchText: 'loon' }),
    item({ id: 'c', searchText: 'heron', active: false }),
  ]

  it('shows active rows by default and ended rows on request', () => {
    expect(filterItems(items, base).map((i) => i.id)).toEqual(['a', 'b'])
    expect(filterItems(items, { ...base, status: 'ended' }).map((i) => i.id)).toEqual(['c'])
  })

  it('narrows to rows due for a check and to the search', () => {
    expect(filterItems(items, { ...base, due: true }).map((i) => i.id)).toEqual(['a'])
    expect(filterItems(items, { ...base, search: 'loon' }).map((i) => i.id)).toEqual(['b'])
  })

  it('shows a linked entry whatever its status', () => {
    expect(filterItems(items, { ...base, entry: 'c' }).map((i) => i.id)).toEqual(['c'])
  })

  it('counts active, ended and due rows that match the search', () => {
    expect(countItems(items, '')).toEqual({ active: 2, ended: 1, due: 1 })
    expect(countItems(items, 'heron')).toEqual({ active: 1, ended: 1, due: 1 })
  })
})

describe('sorting notice contacts', () => {
  const items = [
    item({ id: '1', name: 'loon cove', parcel: '010-010', checked: '2026-01-01' }),
    item({ id: '2', name: 'Heron Landing', parcel: '010-002', checked: null }),
    item({ id: '3', name: 'Alder Shores', parcel: '010-001', checked: '2026-05-01' }),
  ]
  const order = (key: 'name' | 'parcel' | 'checked', dir: 'asc' | 'desc') =>
    sortItems(items, { key, dir }).map((i) => i.id)

  it('sorts by name without regard to case', () => {
    expect(order('name', 'asc')).toEqual(['3', '2', '1'])
    expect(order('name', 'desc')).toEqual(['1', '2', '3'])
  })

  it('sorts parcel IDs in number order', () => {
    expect(order('parcel', 'asc')).toEqual(['3', '2', '1'])
  })

  it('puts never checked first when oldest checks come first', () => {
    expect(order('checked', 'asc')).toEqual(['2', '1', '3'])
    expect(order('checked', 'desc')).toEqual(['3', '1', '2'])
  })
})

describe('paging notice contacts', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    item({
      id: String(i).padStart(2, '0'),
      name: `Park ${String(i).padStart(2, '0')}`,
      searchText: `park ${String(i).padStart(2, '0')}`,
    }),
  )

  it('shows 25 rows a page after filtering and sorting', () => {
    const first = pageOfItems(many, { ...base, sort: byName, offset: 0 })
    expect(first.rows).toHaveLength(25)
    expect(first).toMatchObject({ total: 30, nextOffset: 25, prevOffset: null })
    const second = pageOfItems(many, { ...base, sort: byName, offset: 25 })
    expect(second.rows.map((r) => r.id)).toEqual(['25', '26', '27', '28', '29'])
  })

  it('counts only filtered rows in the total', () => {
    const page = pageOfItems(many, { ...base, search: 'park 2', sort: byName, offset: 0 })
    expect(page.total).toBe(12)
  })
})
