import { describe, expect, it } from 'vitest'
import {
  applicationOpenGroup,
  caseChip,
  caseOpenGroup,
  decisionOutcome,
  inspectionOpenGroup,
  isInForce,
  parcelViewFor,
} from '@/features/parcels/openGroups'

const permit = { board: false, approved: false }
const board = { board: true, approved: true }

describe('what counts as open on a lot', () => {
  it('counts an issued permit as in force, not closed', () => {
    expect(applicationOpenGroup({ state: 'issued', ...permit })).toBe('permit_in_force')
    expect(isInForce('permit_in_force')).toBe(true)
  })

  it('counts a granted board application as in force once it is decided', () => {
    expect(applicationOpenGroup({ state: 'decided', ...board })).toBe('board_in_force')
    expect(applicationOpenGroup({ state: 'issued', ...board })).toBe('board_in_force')
  })

  it('keeps a decided board application without an approving decision in review', () => {
    expect(applicationOpenGroup({ state: 'decided', board: true, approved: false })).toBe(
      'board_review',
    )
  })

  it('says a decided permit is approved and waiting to be issued', () => {
    expect(applicationOpenGroup({ state: 'decided', ...permit })).toBe('permit_to_issue')
  })

  it('splits applications in review into permits and board applications', () => {
    expect(applicationOpenGroup({ state: 'submitted', ...permit })).toBe('permit_review')
    expect(applicationOpenGroup({ state: 'under_review', ...board })).toBe('board_review')
  })

  it('keeps suspended permits and drafts open', () => {
    expect(applicationOpenGroup({ state: 'suspended', ...permit })).toBe('permit_suspended')
    expect(applicationOpenGroup({ state: 'draft', ...permit })).toBe('draft')
    expect(isInForce('permit_suspended')).toBe(false)
  })

  it('treats ended applications as closed', () => {
    for (const state of ['closed', 'denied', 'withdrawn', 'expired'] as const) {
      expect(applicationOpenGroup({ state, ...permit })).toBeNull()
    }
  })

  it('keeps an enforcement case open until it is resolved, closed or found no violation', () => {
    for (const status of [
      'intake',
      'investigating',
      'violation_found',
      'order_issued',
      'in_court',
    ] as const) {
      expect(caseOpenGroup(status)).toBe('case')
    }
    for (const status of ['resolved', 'closed', 'no_violation'] as const) {
      expect(caseOpenGroup(status)).toBeNull()
    }
  })

  it('keeps requested and scheduled inspections open', () => {
    expect(inspectionOpenGroup('requested')).toBe('inspection_requested')
    expect(inspectionOpenGroup('scheduled')).toBe('inspection_scheduled')
    for (const status of ['passed', 'failed', 'cancelled'] as const) {
      expect(inspectionOpenGroup(status)).toBeNull()
    }
  })
})

describe('enforcement case chips', () => {
  it('marks a violation, an order and a court case as failed', () => {
    expect(caseChip('violation_found')).toBe('failed')
    expect(caseChip('order_issued')).toBe('failed')
    expect(caseChip('in_court')).toBe('failed')
  })

  it('keeps intake, investigation, no violation, resolved and closed neutral', () => {
    for (const status of [
      'intake',
      'investigating',
      'no_violation',
      'resolved',
      'closed',
    ] as const) {
      expect(caseChip(status)).toBe('neutral')
    }
  })
})

describe('board decision outcomes', () => {
  it('says the ZBA granted a request', () => {
    expect(decisionOutcome('approved', 'zba')).toEqual({ label: 'Granted', chip: 'passed' })
    expect(decisionOutcome('approved_with_conditions', 'zba')).toEqual({
      label: 'Granted with conditions',
      chip: 'passed',
    })
  })

  it('says the Planning Board approved an application', () => {
    expect(decisionOutcome('approved', 'planning_board')).toEqual({
      label: 'Approved',
      chip: 'passed',
    })
    expect(decisionOutcome('approved_with_conditions', null).label).toBe('Approved with conditions')
  })

  it('marks a denial as failed and a rehearing as neutral', () => {
    expect(decisionOutcome('denied', 'zba')).toEqual({ label: 'Denied', chip: 'failed' })
    expect(decisionOutcome('rehearing_granted', 'zba')).toEqual({
      label: 'Rehearing granted',
      chip: 'neutral',
    })
  })
})

describe('which parcel page a viewer gets', () => {
  it('gives an inspector without the staff role the field version', () => {
    expect(parcelViewFor(['inspector'])).toBe('field')
  })

  it('keeps the office page for the building official and office staff', () => {
    expect(parcelViewFor(['staff', 'inspector'])).toBe('office')
    expect(parcelViewFor(['staff'])).toBe('office')
    expect(parcelViewFor(['finance'])).toBe('office')
    expect(parcelViewFor(['reviewer'])).toBe('office')
  })
})
