import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import { activeFilterLabels, filterKey, readQueueView } from '@/features/queue/queueParams'

describe('activeFilterLabels', () => {
  it('names nothing for the default needs action view', () => {
    expect(activeFilterLabels(readTableParams({}))).toEqual([])
    expect(activeFilterLabels(readTableParams({ state: '', q: '' }))).toEqual([])
  })

  it('names each filter in the order of the filter bar', () => {
    const params = readTableParams({
      q: '0042',
      state: 'denied',
      due: 'overdue',
      assigned: 'me',
      type: 'EL',
      flag: ['fees', 'payment'],
    })
    expect(activeFilterLabels(params, new Map([['EL', 'Electrical permit']]))).toEqual([
      'Number contains 0042',
      'Denied',
      'Overdue',
      'Mine',
      'Electrical permit',
      'Fees due',
      'Payment outcome unknown',
    ])
  })

  it('names the wide view and ignores an unknown status or chip value', () => {
    expect(activeFilterLabels(readTableParams({ state: 'all' }))).toEqual(['All but draft'])
    expect(activeFilterLabels(readTableParams({ state: 'bogus', due: 'later' }))).toEqual([])
  })
})

describe('readQueueView', () => {
  it('reads chips, scope, search and sort from the address', () => {
    const view = readQueueView({
      state: 'all',
      q: '12',
      due: ['week', 'none'],
      assigned: 'none',
      type: ['BP', 'not a key!'],
      flag: 'preservation',
      sort: 'fees',
    })
    expect(view.filters).toEqual({
      states: expect.arrayContaining(['submitted', 'denied']) as unknown,
      numberContains: '12',
      typeKeys: ['BP'],
      due: ['week', 'none'],
      assigned: ['none'],
      flags: ['preservation'],
    })
    expect(view.sort).toEqual({ key: 'fees', dir: 'desc' })
  })

  it('opens on the needs action scope sorted by due date', () => {
    const view = readQueueView({ sort: 'priority' })
    expect(view.filters).toEqual({})
    expect(view.sort).toEqual({ key: 'due', dir: 'asc' })
  })
})

describe('filterKey', () => {
  it('changes when the sort, a chip, or the page changes', () => {
    const key = (raw: Record<string, string>) => filterKey(readTableParams(raw))
    expect(key({})).not.toBe(key({ sort: 'number' }))
    expect(key({})).not.toBe(key({ due: 'overdue' }))
    expect(key({})).not.toBe(key({ cursor: '25' }))
  })
})
