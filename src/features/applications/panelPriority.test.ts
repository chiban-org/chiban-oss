import { describe, expect, it } from 'vitest'
import { historyPanels, panelPriority } from './panelPriority'

describe('the panel priority for each stage', () => {
  it.each([
    ['submitted', ['reviewers', 'completeness', 'clocks', 'fees']],
    ['under_review', ['reviewers', 'completeness', 'clocks', 'fees']],
    ['decided', ['conditions', 'fees', 'edition', 'regional']],
    ['issued', ['inspections', 'conditions', 'fees', 'appeals']],
    ['suspended', ['appeals', 'inspections', 'conditions', 'fees']],
    ['closed', ['documents', 'inspections']],
    ['denied', ['documents', 'inspections']],
    ['withdrawn', ['documents', 'inspections']],
    ['expired', ['documents', 'inspections']],
    ['draft', ['parties', 'fees', 'documents']],
  ] as const)('leads a permit in %s with %j', (state, order) => {
    expect(panelPriority(state, false)).toEqual(order)
  })

  it.each([
    ['submitted', ['board', 'hearings', 'clocks']],
    ['under_review', ['board', 'hearings', 'clocks']],
    ['decided', ['board', 'conditions', 'fees', 'hearings']],
    ['denied', ['documents', 'hearings']],
  ] as const)('leads a board application in %s with %j', (state, order) => {
    expect(panelPriority(state, true)).toEqual(order)
  })

  it('folds activity, records and parties into the history group unless the stage leads with them', () => {
    expect(historyPanels('under_review', false)).toEqual(['activity', 'records', 'parties'])
    expect(historyPanels('draft', false)).toEqual(['activity', 'records'])
  })
})
