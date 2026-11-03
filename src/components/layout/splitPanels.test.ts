import { describe, expect, it } from 'vitest'
import { splitPanels } from './splitPanels'

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
