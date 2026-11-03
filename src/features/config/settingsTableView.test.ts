import { describe, expect, it } from 'vitest'
import {
  arrangeKeyRows,
  KIND_SORT,
  RULE_SORT,
  readKeyListView,
  sortKindSummaries,
  sortRuleSummaries,
} from '@/features/config/settingsTableView'

const KINDS = [
  { kind: 'application_type', keys: 2 },
  { kind: 'form', keys: 7 },
  { kind: 'fee_schedule', keys: 2 },
] as const

describe('settings kind table', () => {
  it('keeps the configured order by default', () => {
    expect(sortKindSummaries(KINDS, { key: KIND_SORT.defaultKey, dir: 'asc' })).toEqual(KINDS)
  })

  it('sorts by the label shown and by item count with ties in list order', () => {
    expect(sortKindSummaries(KINDS, { key: 'kind', dir: 'asc' }).map((r) => r.kind)).toEqual([
      'application_type',
      'fee_schedule',
      'form',
    ])
    expect(sortKindSummaries(KINDS, { key: 'items', dir: 'desc' }).map((r) => r.kind)).toEqual([
      'form',
      'application_type',
      'fee_schedule',
    ])
  })
})

describe('settings rule table', () => {
  const rule = (label: string, citation: string, policy: string) => ({
    key: label,
    version: 1,
    label,
    citation: { label: citation, url: null },
    policy,
    unit: null,
  })
  const RULES = [
    rule('Beta', 'RSA 2', 'Fixed'),
    rule('Alpha', 'RSA 10', 'Fixed'),
    rule('Gamma', 'RSA 1', 'Chosen'),
  ]

  it('sorts by rule, citation with numbers read as numbers, and policy', () => {
    const labels = (key: 'rule' | 'citation' | 'policy') =>
      sortRuleSummaries(RULES, { key, dir: 'asc' }).map((r) => r.label)
    expect(labels('rule')).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(labels('citation')).toEqual(['Gamma', 'Beta', 'Alpha'])
    expect(labels('policy')).toEqual(['Gamma', 'Beta', 'Alpha'])
    expect(RULE_SORT.defaultKey).toBe('order')
  })
})

describe('settings key list', () => {
  const ROWS = [
    { key: 'b', label: 'Zeta', publishedVersion: 2, hasDraft: false },
    { key: 'a', label: null, publishedVersion: null, hasDraft: true },
    { key: 'c', label: 'Alpha', publishedVersion: 5, hasDraft: true },
  ]
  const keys = (raw: Record<string, string>) =>
    arrangeKeyRows('/staff/settings/form', ROWS, readKeyListView(raw)).rows.map((r) => r.key)

  it('keeps list order, then sorts by key, published version and draft', () => {
    expect(keys({})).toEqual(['b', 'a', 'c'])
    expect(keys({ sort: 'key' })).toEqual(['a', 'b', 'c'])
    expect(keys({ sort: 'published' })).toEqual(['c', 'b', 'a'])
    expect(keys({ sort: 'draft' })).toEqual(['a', 'c', 'b'])
    expect(keys({ sort: 'label' })).toEqual(['c', 'b', 'a'])
  })

  it('lets published and draft each hold one choice', () => {
    expect(readKeyListView({ published: ['published', 'unpublished'] }).published).toEqual([
      'published',
    ])
    expect(readKeyListView({ draft: ['none', 'draft'] }).draft).toEqual(['none'])
    const { chips } = arrangeKeyRows(
      '/staff/settings/form',
      ROWS,
      readKeyListView({ published: 'published' }),
    )
    expect(chips[0]?.chips[1]?.href).toBe('/staff/settings/form?published=unpublished')
  })

  it('filters by published and draft and counts the chips', () => {
    expect(keys({ published: 'unpublished' })).toEqual(['a'])
    expect(keys({ draft: 'draft', published: 'published' })).toEqual(['c'])
    const { chips } = arrangeKeyRows(
      '/staff/settings/form',
      ROWS,
      readKeyListView({ draft: 'draft' }),
    )
    expect(chips[0]?.chips.map((c) => c.count)).toEqual([1, 1])
    expect(chips[1]?.chips.map((c) => c.count)).toEqual([2, 1])
  })
})
