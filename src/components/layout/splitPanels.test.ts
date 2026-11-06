import { describe, expect, it } from 'vitest'
import { arrangePanels, splitPanels } from './splitPanels'

describe('splitPanels', () => {
  it('keeps filled panels in order and moves empty ones to their own list', () => {
    const parts = splitPanels([
      { empty: true, node: 'reviewers' },
      { empty: false, node: 'clocks' },
      { empty: false, node: null },
      { empty: true, node: 'appeals' },
      { empty: false, node: 'fees' },
    ])
    expect(parts.filled).toEqual(['clocks', 'fees'])
    expect(parts.empty).toEqual(['reviewers', 'appeals'])
  })

  it('omits the empty list when every panel has content', () => {
    expect(splitPanels([{ empty: false, node: 'clocks' }])).toEqual({ filled: ['clocks'] })
  })

  it('drops a panel that renders nothing even when marked empty', () => {
    expect(splitPanels([{ empty: true, node: null }])).toEqual({ filled: [] })
  })
})

describe('arrangePanels', () => {
  const panels = [
    { key: 'reviewers', empty: false, node: 'reviewers' },
    { key: 'clocks', empty: false, node: 'clocks' },
    { key: 'activity', empty: false, node: 'activity' },
    { key: 'notes', empty: true, node: 'notes' },
    { key: 'fees', empty: false, node: 'fees' },
    { key: 'records', empty: true, node: 'records' },
  ]

  it('leads with the stage panels in their order, then the rest, and folds history apart', () => {
    const parts = arrangePanels(panels, {
      lead: ['fees', 'clocks', 'missing'],
      history: ['activity', 'records'],
    })
    expect(parts.filled).toEqual(['fees', 'clocks', 'reviewers'])
    expect(parts.history).toEqual(['activity'])
    expect(parts.empty).toEqual(['notes', 'records'])
  })

  it('keeps a history panel in the main list when the stage leads with it', () => {
    const parts = arrangePanels(panels, { lead: ['activity'], history: ['activity'] })
    expect(parts.filled).toEqual(['activity', 'reviewers', 'clocks', 'fees'])
    expect(parts.history).toBeUndefined()
  })
})
