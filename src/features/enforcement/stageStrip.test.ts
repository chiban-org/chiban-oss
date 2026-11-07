import { describe, expect, it } from 'vitest'
import type { EnforcementStatus } from '@/db/schema'
import { type CaseStageInput, caseStages } from './stageStrip'

function strip(status: EnforcementStatus, o: Partial<CaseStageInput> = {}): string {
  return caseStages({
    status,
    stayed: false,
    violationFound: true,
    orderIssued: true,
    inCourt: true,
    overdue: false,
    ...o,
  })
    .map(
      (s) =>
        `${s.label}${s.status === 'done' ? ' ✓' : s.status === 'current' ? ' ●' : ''}${s.overdue ? ' !' : ''}`,
    )
    .join(' | ')
}

const AHEAD = { violationFound: false, orderIssued: false, inCourt: false }

describe('the case stage strip', () => {
  it.each([
    [
      'intake',
      AHEAD,
      'Received ● | Investigating | Violation found | Order issued | In court | Resolved | Closed',
    ],
    [
      'investigating',
      AHEAD,
      'Received ✓ | Investigating ● | Violation found | Order issued | In court | Resolved | Closed',
    ],
    [
      'violation_found',
      { orderIssued: false, inCourt: false },
      'Received ✓ | Investigating ✓ | Violation found ● | Order issued | In court | Resolved | Closed',
    ],
    [
      'order_issued',
      { inCourt: false },
      'Received ✓ | Investigating ✓ | Violation found ✓ | Order issued ● | In court | Resolved | Closed',
    ],
    [
      'in_court',
      {},
      'Received ✓ | Investigating ✓ | Violation found ✓ | Order issued ✓ | In court ● | Resolved | Closed',
    ],
    [
      'resolved',
      {},
      'Received ✓ | Investigating ✓ | Violation found ✓ | Order issued ✓ | In court ✓ | Resolved ● | Closed',
    ],
    [
      'closed',
      {},
      'Received ✓ | Investigating ✓ | Violation found ✓ | Order issued ✓ | In court ✓ | Resolved ✓ | Closed ✓',
    ],
  ] as const)('marks the stages at %s', (status, o, expected) => {
    expect(strip(status, o)).toBe(expected)
  })

  it('drops the order and court stages a resolved case skipped', () => {
    expect(strip('resolved', { orderIssued: false, inCourt: false })).toBe(
      'Received ✓ | Investigating ✓ | Violation found ✓ | Resolved ● | Closed',
    )
  })

  it('inserts Stayed as the current stage after the stage reached', () => {
    expect(strip('order_issued', { stayed: true, inCourt: false })).toBe(
      'Received ✓ | Investigating ✓ | Violation found ✓ | Order issued ✓ | Stayed ● | In court | Resolved | Closed',
    )
  })

  it('ends at No violation found in place of the stages not reached', () => {
    expect(strip('no_violation', AHEAD)).toBe('Received ✓ | Investigating ✓ | No violation found ●')
  })

  it('closes after no violation with every stage done', () => {
    expect(strip('closed', AHEAD)).toBe(
      'Received ✓ | Investigating ✓ | No violation found ✓ | Closed ✓',
    )
  })

  it('marks only the current stage overdue', () => {
    expect(strip('order_issued', { inCourt: false, overdue: true })).toBe(
      'Received ✓ | Investigating ✓ | Violation found ✓ | Order issued ● ! | In court | Resolved | Closed',
    )
  })
})
