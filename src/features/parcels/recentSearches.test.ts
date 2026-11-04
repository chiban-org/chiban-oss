import { describe, expect, it } from 'vitest'
import { parseRecent, RECENT_SEARCH_LIMIT, rememberSearch, searchHref } from './recentSearches'

describe('rememberSearch', () => {
  it('puts the newest search first and drops a repeat regardless of case', () => {
    expect(rememberSearch(['Heron Cove', 'Larkspur'], ' larkspur ')).toEqual([
      'larkspur',
      'Heron Cove',
    ])
  })

  it('keeps only the most recent searches', () => {
    const many = Array.from({ length: RECENT_SEARCH_LIMIT }, (_, i) => `street ${i}`)
    const next = rememberSearch(many, 'newest')
    expect(next).toHaveLength(RECENT_SEARCH_LIMIT)
    expect(next[0]).toBe('newest')
  })

  it('ignores searches too short to run', () => {
    expect(rememberSearch(['Heron Cove'], 'a')).toEqual(['Heron Cove'])
  })
})

describe('parseRecent', () => {
  it('reads a stored list and tolerates anything else', () => {
    expect(parseRecent('["Heron Cove",4,"Larkspur"]')).toEqual(['Heron Cove', 'Larkspur'])
    expect(parseRecent('not json')).toEqual([])
    expect(parseRecent('{"q":1}')).toEqual([])
    expect(parseRecent(null)).toEqual([])
  })
})

describe('searchHref', () => {
  it('puts the search after any fixed query and encodes spaces as %20', () => {
    expect(searchHref('/staff/parcels', 'q', 'Heron Cove')).toBe('/staff/parcels?q=Heron%20Cove')
    expect(searchHref('/staff/counter', 'q', '12 Elm', { type: 'shed' })).toBe(
      '/staff/counter?type=shed&q=12%20Elm',
    )
  })
})
