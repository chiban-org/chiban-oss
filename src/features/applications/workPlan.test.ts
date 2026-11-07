import { describe, expect, it } from 'vitest'
import type { GateResult } from '@/features/gates/evaluateGates'
import type { CoreState } from './states'
import { type PlanView, planWork, type WorkPlanExtras } from './workPlan'
import type { PlanActionKind, PlanBoard } from './workPlanTypes'

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
    classification: 'nh.building_permit',
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

const CLERK = extras(['assign_reviewer', 'record_code_edition', 'record_payment'])

describe('the work plan for a building permit under review', () => {
  it('puts assigning a reviewer in the card and says who acts, what, and by when', () => {
    const plan = planWork(view(), null, CLERK)
    expect(plan.now).toMatchObject({
      key: 'reviews.signed_off',
      task: 'Assign a reviewer',
      actor: 'town',
      action: { kind: 'assign_reviewer' },
    })
    expect(plan.sentence).toBe(
      'Waiting on: Town (Sam Clerk). Assign a reviewer. Building permit decision deadline: November 13, 2026, 7 days left.',
    )
  })

  it('lists issuance blockers while the next move is still the decision', () => {
    const plan = planWork(view(), null, CLERK)
    expect(plan.groups.map((g) => g.title)).toEqual([
      'Before the decision',
      'Before it can be issued',
    ])
    const issuance = plan.groups[1]?.rows.map((r) => [r.label, r.done, r.action?.kind ?? null])
    expect(issuance).toEqual([
      ['Code edition recorded', false, 'record_code_edition'],
      ['Fees paid', true, null],
    ])
  })

  it('offers no inline action to a viewer who cannot take it', () => {
    const plan = planWork(view(), null, extras())
    expect(plan.now?.action).toBeNull()
    expect(plan.groups.flatMap((g) => g.rows).every((r) => r.action === null)).toBe(true)
  })

  it('waits on the reviewers once one is assigned but has not signed off', () => {
    const pending = gate(
      'reviews.signed_off',
      'Assigned reviews signed off',
      '1 assigned review is not signed off.',
    )
    const plan = planWork(
      view({ gates: [{ to: 'decided', results: [pending] }] }),
      null,
      extras([], 1),
    )
    expect(plan.now).toMatchObject({
      task: 'Wait for the reviews to be signed off',
      actor: 'reviewers',
      action: null,
    })
    expect(plan.sentence).toMatch(
      /^Waiting on: Reviewers\. Wait for the reviews to be signed off\. /,
    )
  })

  it('makes the decision the card action once nothing blocks it', () => {
    const plan = planWork(view({ gates: [{ to: 'decided', results: [] }] }), null, CLERK)
    expect(plan.now).toMatchObject({
      task: 'Record the decision',
      action: { kind: 'move', to: 'decided' },
    })
    const refused = planWork(view({ gates: [], allowedMoves: ['withdrawn'] }), null, CLERK)
    expect(refused.now).toMatchObject({ action: null, note: 'Your role cannot make this move.' })
  })

  it('asks for completeness first on a submitted building permit and still lists issuance', () => {
    const plan = planWork(
      view({
        state: 'submitted',
        completedDate: null,
        nextTransitions: ['under_review', 'denied', 'withdrawn'],
        allowedMoves: ['under_review', 'denied', 'withdrawn'],
        gates: [{ to: 'under_review', results: [] }],
      }),
      null,
      extras(['mark_complete']),
    )
    expect(plan.now).toMatchObject({
      task: 'Mark the application complete',
      action: { kind: 'mark_complete' },
    })
    expect(plan.groups.map((g) => g.title)).toEqual([
      'Before review starts',
      'Before it can be issued',
    ])
  })
})

describe('the work plan sentence at the ends of the workflow', () => {
  it('waits on the applicant for a draft and offers no card', () => {
    const plan = planWork(
      view({ state: 'draft', nextTransitions: ['withdrawn'], gates: [], gatesAhead: [] }),
      null,
      CLERK,
    )
    expect(plan.sentence).toBe('Waiting on the applicant to submit.')
    expect(plan.now).toBeNull()
  })

  it.each([
    ['closed', 'This permit is closed.'],
    ['denied', 'This application was denied.'],
    ['withdrawn', 'This application was withdrawn.'],
    ['expired', 'This permit expired.'],
  ] as const)('gives a %s record only its outcome and no card', (state: CoreState, sentence) => {
    const plan = planWork(
      view({ state, nextTransitions: [], gates: [], gatesAhead: [] }),
      null,
      CLERK,
    )
    expect(plan.sentence).toBe(sentence)
    expect(plan.now).toBeNull()
    expect(plan.groups).toEqual([])
  })
})

const PLANNING: PlanBoard = {
  board: 'planning_board',
  boardName: 'Planning Board',
  acceptanceMeetingId: 'm1',
  acceptanceDate: '2026-11-25',
  acceptanceText: 'November 25, 2026',
  meetings: [],
  today: '2026-11-06',
}

function filed(o: Partial<PlanView> = {}): PlanView {
  return view({
    state: 'submitted',
    classification: 'nh.site_plan',
    completedDate: null,
    nextTransitions: ['withdrawn'],
    allowedMoves: ['withdrawn'],
    gates: [],
    gatesAhead: [
      { to: 'under_review', results: [gate('abutters.list_issued', 'Abutter list issued', null)] },
    ],
    ...o,
  })
}

describe('the work plan for a filed board application', () => {
  it('waits on the board for the vote at the meeting already set', () => {
    const plan = planWork(filed(), PLANNING, extras(['set_board_meeting', 'record_board_vote']))
    expect(plan.groups.map((g) => g.title)).toEqual(['Before the hearing'])
    expect(plan.groups[0]?.rows.map((r) => [r.label, r.done])).toEqual([
      ['Acceptance meeting set', true],
      ['Abutter list issued', true],
      ['Accepted as complete', false],
    ])
    expect(plan.now).toMatchObject({
      task: 'Vote on completeness at the meeting on November 25, 2026',
      actor: 'board',
      action: null,
    })
    expect(plan.sentence).toMatch(
      /^Waiting on: Planning Board\. Vote on completeness at the meeting on November 25, 2026\./,
    )
  })

  it('asks the clerk to record the vote once the meeting has passed', () => {
    const past = { ...PLANNING, acceptanceDate: '2026-11-02', acceptanceText: 'November 2, 2026' }
    const plan = planWork(filed(), past, extras(['record_board_vote']))
    expect(plan.now).toMatchObject({
      task: 'Record the completeness vote',
      action: { kind: 'record_board_vote' },
    })
  })

  it('asks for the meeting first when none is set', () => {
    const unset = {
      ...PLANNING,
      acceptanceMeetingId: null,
      acceptanceDate: null,
      acceptanceText: null,
    }
    const plan = planWork(filed(), unset, extras(['set_board_meeting']))
    expect(plan.now).toMatchObject({
      task: 'Set the acceptance meeting',
      action: { kind: 'set_board_meeting' },
    })
  })
})

describe('the regional impact requirement once the determination is yes', () => {
  const regional = gate(
    'nh.bp.regional_impact',
    'Regional impact determination and comment period',
    'Regional planning commission not yet notified by certified mail.',
  )
  const decided = (notices: unknown[]) =>
    view({
      state: 'decided',
      nextTransitions: ['issued', 'withdrawn'],
      allowedMoves: ['issued', 'withdrawn'],
      gates: [{ to: 'issued', results: [regional] }],
      gatesAhead: [],
      regionalImpact: {
        applies: true,
        determination: { determination: 'yes' },
        notices,
      } as unknown as PlanView['regionalImpact'],
    })

  it('asks for the certified notice to the commission when none is recorded', () => {
    const plan = planWork(decided([]), null, extras(['record_regional_impact']))
    expect(plan.now).toMatchObject({
      task: 'Record the certified notice to the regional planning commission',
      actor: 'town',
      action: null,
    })
  })

  it('waits out the comment period once the commission has its certified notice', () => {
    const mailed = [{ recipientKind: 'regional_planning_commission', method: 'certified_mail' }]
    const plan = planWork(decided(mailed), null, extras(['record_regional_impact']))
    expect(plan.now).toMatchObject({
      task: 'Wait for the regional comment period to end',
      action: null,
    })
  })
})
