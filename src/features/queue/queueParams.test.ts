import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import { activeFilterLabels, filterKey, readQueueView } from '@/features/queue/queueParams'

describe('activeFilterLabels', () => {
  it('names nothing for the default needs action view', () => {
    expect(activeFilterLabels(readTableParams({}))).toEqual([])
    expect(activeFilterLabels(readTableParams({ stage: 'all', q: '' }))).toEqual([])
  })

  it('names each filter in the order of the filter bar', () => {
    const params = readTableParams({
      q: '0042',
      stage: 'finished',
      due: 'overdue',
      assigned: 'me',
      type: 'EL',
      flag: ['fees', 'payment'],
    })
    expect(activeFilterLabels(params, new Map([['EL', 'Electrical permit']]))).toEqual([
      'Number contains 0042',
      'Overdue',
      'Mine',
      'Electrical permit',
      'Fees due',
      'Payment outcome unknown',
    ])
  })

  it('leaves the status tab to the tabs and ignores an unknown chip value', () => {
    expect(activeFilterLabels(readTableParams({ stage: 'all' }))).toEqual([])
    expect(activeFilterLabels(readTableParams({ stage: 'bogus', due: 'later' }))).toEqual([])
  })
})

describe('readQueueView', () => {
  it('reads chips, tab, search and sort from the address', () => {
    const view = readQueueView({
      stage: 'all',
      q: '12',
      due: ['week', 'none'],
      assigned: 'none',
      type: ['BP', 'not a key!'],
      flag: 'preservation',
      sort: 'fees',
    })
    expect(view.filters).toEqual({
      states: expect.arrayContaining(['draft', 'submitted', 'denied']) as unknown,
      numberContains: '12',
      typeKeys: ['BP'],
      due: ['week', 'none'],
      assigned: ['none'],
      flags: ['preservation'],
    })
    expect(view.sort).toEqual({ key: 'fees', dir: 'desc' })
  })

  it('opens on the needs action scope sorted by due date', () => {
    const view = readQueueView({ sort: 'priority', state: 'bogus' })
    expect(view.filters).toEqual({})
    expect(view.sort).toEqual({ key: 'due', dir: 'asc' })
  })

  it('reads a status tab into its states and sorts by project or received date', () => {
    expect(readQueueView({ stage: 'issued' }).filters).toEqual({
      states: ['issued', 'suspended'],
    })
    expect(readQueueView({ sort: 'project' }).sort).toEqual({ key: 'project', dir: 'asc' })
    expect(readQueueView({ sort: 'received' }).sort).toEqual({ key: 'received', dir: 'desc' })
  })
})

describe('filterKey', () => {
  it('changes when the sort, a chip, or the page changes', () => {
    const key = (raw: Record<string, string>) => filterKey(readTableParams(raw))
    expect(key({})).not.toBe(key({ sort: 'number' }))
    expect(key({})).not.toBe(key({ due: 'overdue' }))
    expect(key({})).not.toBe(key({ cursor: '25' }))
    expect(key({})).not.toBe(key({ stage: 'all' }))
  })
})
