import { describe, expect, it } from 'vitest'
import type { GateResult } from '@/features/gates/evaluateGates'
import { activityPhrase } from './activityPhrase'
import { applicationStatusText } from './statusText'
import { moveTask, type PlanView, planWork, type WorkPlanExtras } from './workPlan'
import type { PlanActionKind, PlanBoard } from './workPlanTypes'

const REVIEWS: GateResult = {
  key: 'reviews.signed_off',
  label: 'Assigned reviews signed off',
  citation: null,
  kind: 'administrative',
  outcome: { status: 'blocked', reason: 'No reviewer is assigned.' },
  override: null,
  effective: 'blocked',
}

function view(o: Partial<PlanView> = {}): PlanView {
  return {
    state: 'under_review',
    isBuildingPermit: true,
    classification: 'nh.building_permit',
    completedDate: '2026-10-30',
    nextTransitions: ['decided', 'denied', 'withdrawn'],
    allowedMoves: ['decided', 'denied', 'withdrawn'],
    gates: [{ to: 'decided', results: [] }],
    gatesAhead: [],
    allowsDirectIssue: false,
    clocks: [],
    regionalImpact: { applies: false, determination: null, notices: [] },
    ...o,
  } as PlanView
}

function extras(abilities: PlanActionKind[] = []): WorkPlanExtras {
  return { reviewers: 0, abilities: new Set(abilities), responsible: 'Sam Clerk' }
}

const CLERK = extras(['assign_reviewer', 'record_code_edition', 'record_payment'])

const ZONING: PlanBoard = {
  boardKind: 'zba',
  boardName: 'Zoning Board',
  missingBoard: null,
  acceptanceMeetingId: null,
  acceptanceDate: null,
  acceptanceText: null,
  meetings: [],
  today: '2026-11-06',
}

describe('the move labels in the work plan', () => {
  it('a permit with no board offers to approve the application once nothing blocks it', () => {
    const plan = planWork(view(), null, CLERK)
    expect(plan.now).toMatchObject({
      task: 'Approve the application',
      action: { kind: 'move', to: 'decided' },
    })
    const refused = planWork(view({ gates: [], allowedMoves: ['withdrawn'] }), null, CLERK)
    expect(refused.now).toMatchObject({ action: null, note: 'Your role cannot make this move.' })
  })

  it('a still blocked permit keeps the blocker in the card', () => {
    const plan = planWork(view({ gates: [{ to: 'decided', results: [REVIEWS] }] }), null, CLERK)
    expect(plan.now).toMatchObject({ task: 'Assign a reviewer' })
  })

  it('a decided variance offers to mark the approval in effect', () => {
    const decided = view({
      state: 'decided',
      isBuildingPermit: false,
      classification: 'nh.zba_variance',
      nextTransitions: ['issued', 'expired', 'withdrawn'],
      allowedMoves: ['issued', 'expired', 'withdrawn'],
      gates: [{ to: 'issued', results: [] }],
    })
    const plan = planWork(decided, ZONING, CLERK)
    expect(plan.now).toMatchObject({
      task: 'Mark the approval in effect',
      action: { kind: 'move', to: 'issued' },
    })
  })

  it('names each move for the kind of application', () => {
    expect(moveTask('decided', false)).toBe('Approve the application')
    expect(moveTask('decided', true)).toBe('Record the decision')
    expect(moveTask('issued', false)).toBe('Issue the permit')
    expect(moveTask('issued', true)).toBe('Mark the approval in effect')
    expect(moveTask('denied', false)).toBe('Deny the application')
  })
})

describe('the approval words on the chip and in the history', () => {
  it('a permit with no board reads approved, a board application keeps decided', () => {
    expect(applicationStatusText('decided', null, [], false)).toBe('Approved')
    expect(applicationStatusText('decided', null, [], true)).toBe('Decided')
    expect(applicationStatusText('decided', null, [])).toBe('Decided')
    expect(applicationStatusText('issued', null, [], false)).toBe('Issued')
    expect(activityPhrase('application.transition', { state: 'decided' }, false)).toBe(
      'Moved the application to Approved',
    )
    expect(activityPhrase('application.transition', { state: 'decided' }, true)).toBe(
      'Moved the application to Decided',
    )
    expect(activityPhrase('application.transition', { state: 'decided' })).toBe(
      'Moved the application to Decided',
    )
  })
})
