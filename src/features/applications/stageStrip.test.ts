import { describe, expect, it } from 'vitest'
import { type StageInput, stagesFor } from './stageStrip'
import type { CoreState } from './states'

function strip(state: CoreState, o: Partial<StageInput> = {}): string {
  return stagesFor({
    state,
    substep: null,
    board: false,
    allowsDirectIssue: false,
    completeness: true,
    receivedDate: '2026-10-20',
    completedDate: '2026-10-22',
    issuedOn: null,
    overdue: false,
    ...o,
  })
    .map(
      (s) =>
        `${s.label}${s.status === 'done' ? ' ✓' : s.status === 'current' ? ' ●' : ''}${s.overdue ? ' !' : ''}`,
    )
    .join(' | ')
}

describe('the stage strip for a building permit', () => {
  it.each([
    [
      'draft',
      { receivedDate: null, completedDate: null },
      'Submitted ● | Complete | Review | Decided | Issued | Inspections | Closed',
    ],
    [
      'submitted',
      { completedDate: null },
      'Submitted ✓ | Complete ● | Review | Decided | Issued | Inspections | Closed',
    ],
    [
      'under_review',
      {},
      'Submitted ✓ | Complete ✓ | Review ● | Decided | Issued | Inspections | Closed',
    ],
    [
      'decided',
      {},
      'Submitted ✓ | Complete ✓ | Review ✓ | Decided ✓ | Issued ● | Inspections | Closed',
    ],
    [
      'issued',
      { issuedOn: '2026-11-01' },
      'Submitted ✓ | Complete ✓ | Review ✓ | Decided ✓ | Issued ✓ | Inspections ● | Closed',
    ],
    [
      'suspended',
      { issuedOn: '2026-11-01' },
      'Submitted ✓ | Complete ✓ | Review ✓ | Decided ✓ | Issued ✓ | Suspended ● | Inspections | Closed',
    ],
    [
      'closed',
      { issuedOn: '2026-11-01' },
      'Submitted ✓ | Complete ✓ | Review ✓ | Decided ✓ | Issued ✓ | Inspections ✓ | Closed ✓',
    ],
    ['denied', {}, 'Submitted ✓ | Complete ✓ | Denied ●'],
    ['withdrawn', { receivedDate: null, completedDate: null }, 'Withdrawn ●'],
    [
      'expired',
      { issuedOn: '2026-01-01' },
      'Submitted ✓ | Complete ✓ | Review ✓ | Decided ✓ | Issued ✓ | Expired ●',
    ],
  ] as const)('in %s reads %s', (state, facts, expected) => {
    expect(strip(state, facts)).toBe(expected)
  })

  it('marks only the current stage as overdue, and only when a clock is late', () => {
    expect(strip('under_review', { overdue: true })).toBe(
      'Submitted ✓ | Complete ✓ | Review ● ! | Decided | Issued | Inspections | Closed',
    )
  })
})

describe('the stage strip for a trade permit', () => {
  const trade = { allowsDirectIssue: true, completeness: false }

  it('runs straight from submission to issuance', () => {
    expect(strip('submitted', trade)).toBe('Submitted ✓ | Issued ● | Inspections | Closed')
  })

  it('shows the review it was sent to as the current stage', () => {
    expect(strip('under_review', trade)).toBe(
      'Submitted ✓ | Review ● | Issued | Inspections | Closed',
    )
  })
})

describe('the stage strip for a board application', () => {
  const board = { board: true, completeness: false, completedDate: null }

  it.each([
    [
      'draft',
      { receivedDate: null },
      null,
      'Filed ● | Accepted | Hearing | Decision | Appeal period',
    ],
    [
      'submitted',
      {},
      'acceptance_scheduled',
      'Filed ✓ | Accepted ● | Hearing | Decision | Appeal period',
    ],
    ['under_review', {}, 'hearing', 'Filed ✓ | Accepted ✓ | Hearing ● | Decision | Appeal period'],
    [
      'under_review',
      {},
      'deliberation',
      'Filed ✓ | Accepted ✓ | Hearing ✓ | Decision ● | Appeal period',
    ],
    ['decided', {}, null, 'Filed ✓ | Accepted ✓ | Hearing ✓ | Decision ✓ | Appeal period ●'],
    ['denied', {}, null, 'Filed ✓ | Accepted ✓ | Hearing ✓ | Decision ✓ | Appeal period ●'],
    ['withdrawn', {}, null, 'Filed ✓ | Withdrawn ●'],
  ] as const)('in %s (%s, %s) reads %s', (state, facts, substep, expected) => {
    expect(strip(state, { ...board, ...facts, substep })).toBe(expected)
  })
})
