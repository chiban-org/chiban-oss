import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import type { SortConfig } from '@/features/dataTable/sort'
import { activeSortFields, scopedSort } from '@/features/staffTables/scopedSort'

type Key = 'month' | 'type' | 'count'

const CONFIG: SortConfig<Key> = {
  defaultKey: 'month',
  columns: { month: 'asc', type: 'asc', count: 'desc' },
}

describe('scopedSort', () => {
  it('reads the state from the scoped parameters only', () => {
    const params = readTableParams({ sort: 'count', volume_sort: 'type', volume_dir: 'desc' })
    const { state } = scopedSort('/p', params, CONFIG, 'volume')
    expect(state).toEqual({ key: 'type', dir: 'desc' })
  })

  it('falls back to the default when the scope has no sort', () => {
    const { state } = scopedSort('/p', readTableParams({ sort: 'count' }), CONFIG, 'volume')
    expect(state).toEqual({ key: 'month', dir: 'asc' })
  })

  it('writes header links under the scoped names and keeps the other scope intact', () => {
    const params = readTableParams({ other_sort: 'count', other_dir: 'desc', from: '2027-01-01' })
    const { links } = scopedSort('/p', params, CONFIG, 'volume')
    const href = new URL(links.type.href, 'http://x')
    expect(href.searchParams.get('volume_sort')).toBe('type')
    expect(href.searchParams.get('volume_dir')).toBe('asc')
    expect(href.searchParams.get('other_sort')).toBe('count')
    expect(href.searchParams.get('from')).toBe('2027-01-01')
    expect(href.searchParams.has('sort')).toBe(false)
  })

  it('flips the direction of the active column and drops the params at the default', () => {
    const params = readTableParams({ volume_sort: 'type', volume_dir: 'asc' })
    const { links } = scopedSort('/p', params, CONFIG, 'volume')
    expect(links.type.direction).toBe('asc')
    expect(new URL(links.type.href, 'http://x').searchParams.get('volume_dir')).toBe('desc')
    expect(links.month.href).toBe('/p')
  })

  it('lists the active scoped sort fields for GET forms', () => {
    const params = readTableParams({ volume_sort: 'type', volume_dir: 'desc', cursor: '5' })
    expect(activeSortFields(params, ['volume', 'other'])).toEqual([
      ['volume_sort', 'type'],
      ['volume_dir', 'desc'],
    ])
  })
})
