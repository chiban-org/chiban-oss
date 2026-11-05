import { describe, expect, it } from 'vitest'
import type { SearchGroup, SearchResult } from '@/features/search/searchTypes'
import { searchOptions, sectionsOf } from './searchOptions'

const apps: SearchGroup = {
  key: 'applications',
  label: 'Applications',
  rows: [
    {
      key: 'a1',
      href: '/staff/applications/a1',
      title: 'PL-2026-0005',
      detail: 'Plumbing permit, 4 Elm Street',
      chip: { status: 'passed', label: 'Issued' },
      newTab: false,
    },
  ],
  seeAll: { href: '/staff/applications?q=PL&stage=all', label: 'See all application matches' },
}

const parcels: SearchGroup = {
  key: 'parcels',
  label: 'Parcels',
  rows: [
    {
      key: 'p1',
      href: '/staff/parcels/p1',
      title: '007001000000',
      detail: '4 Elm Street',
      chip: null,
      newTab: false,
    },
  ],
  seeAll: null,
}

function result(patch: Partial<SearchResult>): SearchResult {
  return { query: 'PL-2026-0005', exact: null, groups: [apps, parcels], ...patch }
}

describe('searchOptions', () => {
  it('lists every row and the see-all link in group order', () => {
    const { options, exactIndex } = searchOptions(result({}))
    expect(options.map((o) => o.title)).toEqual([
      'PL-2026-0005',
      'See all application matches',
      '007001000000',
    ])
    expect(exactIndex).toBe(-1)
  })

  it('points at the listed row when the exact number is already in a group', () => {
    const exact = {
      kind: 'application' as const,
      number: 'PL-2026-0005',
      href: '/staff/applications/a1',
      newTab: false,
    }
    const { options, exactIndex } = searchOptions(result({ exact }))
    expect(options).toHaveLength(3)
    expect(exactIndex).toBe(0)
  })

  it('adds an exact number entry first when no group lists it', () => {
    const exact = {
      kind: 'receipt' as const,
      number: 'R-2026-000001',
      href: '/staff/receipts/r1',
      newTab: true,
    }
    const { options, exactIndex } = searchOptions(result({ exact }))
    expect(exactIndex).toBe(0)
    expect(options[0]).toMatchObject({
      section: 'Exact number',
      title: 'R-2026-000001',
      detail: 'Receipt, opens in a new tab',
      newTab: true,
    })
  })
})

describe('sectionsOf', () => {
  it('groups options under their section with their flat index', () => {
    const sections = sectionsOf(searchOptions(result({})).options)
    expect(sections.map((s) => [s.label, s.items.map((i) => i.index)])).toEqual([
      ['Applications', [0, 1]],
      ['Parcels', [2]],
    ])
  })
})
