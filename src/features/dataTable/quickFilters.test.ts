import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import {
  chipGroups,
  filterTabs,
  filterValues,
  labeledOptions,
  singleValue,
  whenAny,
} from '@/features/dataTable/quickFilters'

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

describe('chipGroups for a pick-one group', () => {
  const groups = chipGroups('/q', readTableParams({ assigned: 'mine' }), [
    {
      param: 'assigned',
      label: 'Assignment',
      single: true,
      options: [
        { value: 'mine', label: 'Mine' },
        { value: 'unassigned', label: 'Unassigned' },
      ],
    },
  ])

  it('switches to the other value instead of adding it', () => {
    expect(groups[0]?.chips[1]).toMatchObject({ href: '/q?assigned=unassigned', active: false })
  })

  it('still turns the active value off', () => {
    expect(groups[0]?.chips[0]).toMatchObject({ href: '/q', active: true })
  })

  it('treats only the first value as active when a link carries several', () => {
    const both = chipGroups('/q', readTableParams({ assigned: ['mine', 'unassigned'] }), [
      {
        param: 'assigned',
        label: 'Assignment',
        single: true,
        options: [
          { value: 'mine', label: 'Mine' },
          { value: 'unassigned', label: 'Unassigned' },
        ],
      },
    ])
    expect(both[0]?.chips.map((c) => c.active)).toEqual([true, false])
  })
})

describe('singleValue', () => {
  it('keeps only the first allowed value', () => {
    const params = readTableParams({ assigned: ['bogus', 'unassigned', 'mine'] })
    expect(singleValue(params, 'assigned', ['mine', 'unassigned'])).toEqual(['unassigned'])
    expect(singleValue(params, 'missing', ['mine'])).toEqual([])
  })
})

describe('filterTabs', () => {
  const group = {
    param: 'stage',
    label: 'Status',
    options: [
      { value: 'open', label: 'Open', count: 4 },
      { value: 'issued', label: 'Issued', count: 7 },
    ],
  }

  it('puts an All tab first that is active when no value is chosen', () => {
    const tabs = filterTabs('/a', readTableParams({ sort: 'number', cursor: '25' }), group)
    expect(tabs).toEqual([
      { label: 'All', href: '/a?sort=number', active: true, count: 11 },
      { label: 'Open', href: '/a?sort=number&stage=open', active: false, count: 4 },
      { label: 'Issued', href: '/a?sort=number&stage=issued', active: false, count: 7 },
    ])
  })

  it('switches tabs and keeps the active tab linked to itself', () => {
    const tabs = filterTabs('/a', readTableParams({ stage: ['issued', 'open'] }), group)
    expect(tabs.map((t) => [t.href, t.active])).toEqual([
      ['/a', false],
      ['/a?stage=open', false],
      ['/a?stage=issued', true],
    ])
  })

  it('treats an unknown value as All and leaves the All count off when counts are missing', () => {
    const tabs = filterTabs('/a', readTableParams({ stage: 'bogus' }), {
      ...group,
      options: [{ value: 'open', label: 'Open' }],
    })
    expect(tabs[0]).toEqual({ label: 'All', href: '/a', active: true })
  })
})

describe('filterTabs with a named default tab', () => {
  const group = {
    param: 'stage',
    label: 'Status',
    defaultTab: 'action',
    options: [
      { value: 'action', label: 'Needs action', count: 3 },
      { value: 'open', label: 'Open', count: 4 },
      { value: 'all', label: 'All', count: 9 },
    ],
  }

  it('makes the default tab active with no param and links it without the param', () => {
    const tabs = filterTabs('/a', readTableParams({ sort: 'number', cursor: '25' }), group)
    expect(tabs).toEqual([
      { label: 'Needs action', href: '/a?sort=number', active: true, count: 3 },
      { label: 'Open', href: '/a?sort=number&stage=open', active: false, count: 4 },
      { label: 'All', href: '/a?sort=number&stage=all', active: false, count: 9 },
    ])
  })

  it('adds no synthetic All tab and keeps the given counts', () => {
    const tabs = filterTabs('/a', readTableParams({ stage: 'all' }), group)
    expect(tabs.map((t) => [t.label, t.href, t.active, t.count])).toEqual([
      ['Needs action', '/a', false, 3],
      ['Open', '/a?stage=open', false, 4],
      ['All', '/a?stage=all', true, 9],
    ])
  })

  it('falls back to the default tab for an unknown value', () => {
    const tabs = filterTabs('/a', readTableParams({ stage: 'bogus' }), group)
    expect(tabs.filter((t) => t.active).map((t) => t.label)).toEqual(['Needs action'])
  })
})

describe('labeledOptions', () => {
  it('turns labels into options and attaches counts when given', () => {
    const labels = new Map([
      ['overdue', 'Overdue'],
      ['week', 'Due this week'],
    ])
    expect(labeledOptions(labels)).toEqual([
      { value: 'overdue', label: 'Overdue' },
      { value: 'week', label: 'Due this week' },
    ])
    expect(labeledOptions(labels, new Map([['overdue', 4]]))).toEqual([
      { value: 'overdue', label: 'Overdue', count: 4 },
      { value: 'week', label: 'Due this week' },
    ])
  })
})

describe('whenAny', () => {
  it('adds the key only when there is at least one value', () => {
    expect({ ...whenAny('due', ['week']) }).toEqual({ due: ['week'] })
    expect({ ...whenAny('due', []) }).toEqual({})
  })
})
