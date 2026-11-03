import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import { tombstoneChipGroups } from '@/features/disposition/tombstoneChips'
import { readTombstoneView } from '@/features/disposition/tombstoneParams'

const facets = { kinds: new Map(), windows: new Map(), series: [] }

describe('the Disposed of filter', () => {
  it('reads only one time window even when the address names both', () => {
    const view = readTombstoneView({ when: ['recent', 'older'] })
    expect(view.filters.windows).toEqual(['recent'])
  })

  it('swaps the window instead of adding a second one', () => {
    const groups = tombstoneChipGroups(readTableParams({ when: 'recent' }), facets)
    const earlier = groups
      .find((g) => g.label === 'Disposed of')
      ?.chips.find((c) => c.label === 'Earlier')
    expect(earlier?.href).toBe('/staff/records/disposed?when=older')
  })

  it('sorts by who approved the batch from its header', () => {
    expect(readTombstoneView({ sort: 'approver' }).sort).toEqual({ key: 'approver', dir: 'asc' })
  })
})
