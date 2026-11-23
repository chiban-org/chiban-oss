import { describe, expect, it } from 'vitest'
import type { GateResult } from '@/features/gates/evaluateGates'
import { type PlanView, planWork, type WorkPlanExtras } from './workPlan'
import { hostedActions, type PlanActionKind } from './workPlanTypes'

function gate(key: string, label: string, reason: string | null): GateResult {
  return {
    key,
    label,
    citation: null,
    kind: 'administrative',
    outcome: reason === null ? { status: 'pass' } : { status: 'blocked', reason },
    override: null,
    effective: reason === null ? 'pass' : 'blocked',
  }
}

const REVIEWS = gate(
  'reviews.signed_off',
  'Assigned reviews signed off',
  'No reviewer is assigned.',
)
const EDITION = gate(
  'nh.bp.code_edition_recorded',
  'Code edition recorded before issuance',
  'No code edition is recorded.',
)
const FEES = gate('fees.paid', 'Fees paid', null)
const CLOCK = {
  status: 'running',
  daysRemaining: 7,
  ruleLabel: 'Building permit decision deadline',
  currentDue: { value: '2026-11-13' },
}

function view(o: Partial<PlanView> = {}): PlanView {
  return {
    state: 'under_review',
    isBuildingPermit: true,
    completedDate: '2026-10-30',
    nextTransitions: ['decided', 'denied', 'withdrawn'],
    allowedMoves: ['decided', 'denied', 'withdrawn'],
    gates: [{ to: 'decided', results: [REVIEWS] }],
    gatesAhead: [{ to: 'issued', results: [EDITION, FEES] }],
    allowsDirectIssue: false,
    clocks: [CLOCK],
    regionalImpact: { applies: false, determination: null, notices: [] },
    ...o,
  } as PlanView
}

function extras(abilities: PlanActionKind[] = [], reviewers = 0): WorkPlanExtras {
  return { reviewers, abilities: new Set(abilities), responsible: 'Sam Clerk' }
}

const DUE_INSPECTION = {
  task: 'Framing reinspection',
  note: 'Today at 10:30 AM',
  sentence: 'Waiting on: Inspector (you). Framing reinspection today at 10:30 AM.',
}

function issued(o: Partial<PlanView> = {}): PlanView {
  return view({
    state: 'issued',
    nextTransitions: ['closed'],
    allowedMoves: ['closed'],
    gates: [
      {
        to: 'closed',
        results: [
          gate(
            'inspections.final_passed',
            'Final inspection passed',
            'No final inspection has passed.',
          ),
        ],
      },
    ],
    gatesAhead: [],
    ...o,
  })
}

describe('the work plan for an official who also records inspections', () => {
  const OFFICIAL = {
    ...extras(['record_inspection_result']),
    inspection: DUE_INSPECTION,
  }

  it('puts the due inspection in the card with the result form as its action', () => {
    const plan = planWork(issued(), null, OFFICIAL)
    expect(plan.now).toMatchObject({
      task: 'Framing reinspection',
      note: 'Today at 10:30 AM',
      actor: 'inspector',
      action: { kind: 'record_inspection_result' },
    })
    expect(plan.sentence).toBe(
      'Waiting on: Inspector (you). Framing reinspection today at 10:30 AM.',
    )
    expect(hostedActions(plan).has('record_inspection_result')).toBe(true)
  })

  it('keeps the requirement groups as they were', () => {
    const plain = planWork(issued(), null, extras())
    const official = planWork(issued(), null, OFFICIAL)
    expect(official.groups).toEqual(plain.groups)
    expect(official.terminal).toEqual(plain.terminal)
  })

  it('changes nothing without the ability or without a due inspection', () => {
    const plain = planWork(issued(), null, extras())
    expect(planWork(issued(), null, { ...extras(), inspection: DUE_INSPECTION })).toEqual(plain)
    expect(planWork(issued(), null, extras(['record_inspection_result']))).toEqual(plain)
  })

  it('leaves a draft and an ended record alone', () => {
    const draft = view({
      state: 'draft',
      nextTransitions: ['withdrawn'],
      gates: [],
      gatesAhead: [],
    })
    expect(planWork(draft, null, OFFICIAL).now).toBeNull()
    expect(planWork(issued({ state: 'closed' }), null, OFFICIAL).sentence).toBe(
      'This permit is closed.',
    )
  })
})
