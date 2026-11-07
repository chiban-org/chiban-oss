import { describe, expect, it } from 'vitest'
import { caseHistoryPanels, casePanelPriority } from './panelPriority'

describe('the case panel priority for each stage', () => {
  it.each([
    ['intake', ['notes', 'complaints', 'findings']],
    ['investigating', ['notes', 'complaints', 'findings']],
    ['violation_found', ['findings', 'documents']],
    ['order_issued', ['orders', 'documents']],
    ['in_court', ['orders', 'fines', 'counsel']],
    ['resolved', ['orders', 'documents']],
    ['closed', ['orders', 'documents']],
    ['no_violation', ['findings', 'notes', 'complaints']],
  ] as const)('leads a case in %s with %j', (status, order) => {
    expect(casePanelPriority(status, false)).toEqual(order)
  })

  it('leads a stayed case with its appeals, then the stage order', () => {
    expect(casePanelPriority('order_issued', true)).toEqual(['appeals', 'orders', 'documents'])
  })

  it('folds complaints and notes into the history group only after the order', () => {
    expect(caseHistoryPanels('investigating', false)).toEqual([])
    expect(caseHistoryPanels('violation_found', false)).toEqual([])
    expect(caseHistoryPanels('order_issued', false)).toEqual(['complaints', 'notes'])
    expect(caseHistoryPanels('in_court', false)).toEqual(['complaints', 'notes'])
    expect(caseHistoryPanels('closed', false)).toEqual(['complaints', 'notes'])
  })
})
