import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import { chipGroups, filterValues } from '@/features/dataTable/quickFilters'

describe('filterValues', () => {
  const params = readTableParams({ due: ['overdue', 'bogus', 'week', 'overdue'], type: 'BP' })

  it('keeps only allowed values, once each, in the order given', () => {
    expect(filterValues(params, 'due', ['overdue', 'week', 'none'])).toEqual(['overdue', 'week'])
  })

  it('accepts a predicate for values that come from data', () => {
    expect(filterValues(params, 'type', (v) => /^[A-Z]+$/.test(v))).toEqual(['BP'])
    expect(filterValues(params, 'missing', ['x'])).toEqual([])
  })
})

describe('chipGroups', () => {
  const params = readTableParams({ due: 'overdue', state: 'all', cursor: '25' })
  const groups = chipGroups('/q', params, [
    {
      param: 'due',
      label: 'Deadline',
      options: [
        { value: 'overdue', label: 'Overdue', count: 3 },
        { value: 'week', label: 'Due this week' },
      ],
    },
  ])

  it('marks the active chip and links it to its own removal', () => {
    expect(groups[0]?.chips[0]).toEqual({
      label: 'Overdue',
      href: '/q?state=all',
      active: true,
      count: 3,
    })
  })

  it('links an inactive chip to adding its value to the group', () => {
    expect(groups[0]?.chips[1]).toEqual({
      label: 'Due this week',
      href: '/q?due=overdue&due=week&state=all',
      active: false,
    })
  })

  it('keeps an active value that is no longer offered so it can be turned off', () => {
    const [group] = chipGroups('/q', readTableParams({ type: 'EL' }), [
      { param: 'type', label: 'Type', options: [{ value: 'BP', label: 'Building' }] },
    ])
    expect(group?.chips.map((c) => [c.label, c.active, c.href])).toEqual([
      ['Building', false, '/q?type=EL&type=BP'],
      ['EL', true, '/q'],
    ])
  })
})
