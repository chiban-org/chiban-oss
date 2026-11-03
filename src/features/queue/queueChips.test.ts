import { describe, expect, it } from 'vitest'
import { readTableParams } from '@/features/dataTable/params'
import { queueChipGroups, statusTabs } from '@/features/queue/queueChips'
import type { QueueFacets } from '@/features/queue/queueFacets'

const facets: QueueFacets = {
  stages: new Map([['open', 3]]),
  states: new Map([
    ['submitted', 2],
    ['under_review', 1],
    ['issued', 0],
  ]),
  due: new Map(),
  assigned: new Map(),
  flags: new Map(),
  types: [],
}

describe('queueChipGroups', () => {
  it('leaves the Flags menu out for someone without full record access', () => {
    const labels = (full: boolean) =>
      queueChipGroups(readTableParams({}), facets, full).map((g) => g.label)
    expect(labels(true)).toContain('Flags')
    expect(labels(false)).not.toContain('Flags')
  })

  it('offers a Status menu of the states present in the tab, keeping a chosen empty one', () => {
    const status = queueChipGroups(readTableParams({ state: 'issued' }), facets, true).find(
      (g) => g.label === 'Status',
    )
    expect(status?.display).toBe('menu')
    expect(status?.chips.map((c) => [c.label, c.active, c.count])).toEqual([
      ['Submitted', false, 2],
      ['Under review', false, 1],
      ['Issued', true, 0],
    ])
  })
})

describe('statusTabs', () => {
  it('drops a chosen state when switching tabs', () => {
    const tabs = statusTabs(readTableParams({ stage: 'open', state: 'submitted' }), facets)
    expect(tabs.map((t) => t.href)).toContain('/staff/applications?stage=issued')
    expect(tabs.every((t) => !t.href.includes('state='))).toBe(true)
  })
})
