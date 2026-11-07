import { describe, expect, it } from 'vitest'
import type { GateResult } from '@/features/gates/evaluateGates'
import { type PlanView, planWork, type WorkPlanExtras } from './workPlan'
import type { PlanActionKind, PlanBoard } from './workPlanTypes'

function gate(key: string, label: string, reason: string | null): GateResult {
  return {
    key,
    label,
    citation: null,
    kind: 'statutory',
    outcome: reason === null ? { status: 'pass' } : { status: 'blocked', reason },
    override: null,
    effective: reason === null ? 'pass' : 'blocked',
  }
}

const COMPLETENESS = {
  ruleKey: 'nh.pb.completeness',
  ruleLabel: 'Planning Board completeness determination',
  status: 'running',
  daysRemaining: 6,
  currentDue: { value: '2026-11-12' },
}

function filed(o: Partial<PlanView> = {}): PlanView {
  return {
    state: 'submitted',
    classification: 'nh.site_plan',
    completedDate: null,
    nextTransitions: ['withdrawn'],
    allowedMoves: ['withdrawn'],
    gates: [],
    gatesAhead: [
      { to: 'under_review', results: [gate('abutters.list_issued', 'Abutter list issued', null)] },
    ],
    allowsDirectIssue: false,
    clocks: [COMPLETENESS],
    regionalImpact: { applies: false, determination: null, notices: [] },
    ...o,
  } as PlanView
}

const PLANNING: PlanBoard = {
  board: 'planning_board',
  boardName: 'Planning Board',
  acceptanceMeetingId: 'm25',
  acceptanceDate: '2026-11-25',
  acceptanceText: 'November 25, 2026',
  meetings: [
    {
      id: 'm12',
      date: '2026-11-12',
      text: 'November 12, 2026, regular meeting',
      filedInTime: true,
      noticeable: true,
    },
    {
      id: 'm25',
      date: '2026-11-25',
      text: 'November 25, 2026, regular meeting',
      filedInTime: true,
      noticeable: true,
    },
  ],
  today: '2026-11-06',
}

function extras(abilities: PlanActionKind[]): WorkPlanExtras {
  return { reviewers: 0, abilities: new Set(abilities), responsible: 'Sam Clerk' }
}

const WARNING =
  'The meeting set, November 25, 2026, is after this deadline: Planning Board completeness determination, November 12, 2026.'

describe('a board meeting set after the deadline it must meet', () => {
  it('warns in the card and hosts the move of the meeting for a clerk who can set it', () => {
    const plan = planWork(filed(), PLANNING, extras(['set_board_meeting']))
    expect(plan.now).toMatchObject({
      key: 'board.meeting.move',
      task: 'Move the acceptance meeting',
      actor: 'town',
      action: { kind: 'set_board_meeting' },
      warnings: [{ key: 'board.meeting.deadline', text: WARNING }],
    })
    expect(plan.sentence).toMatch(
      /^Waiting on: Town \(Sam Clerk\)\. Move the acceptance meeting\. Planning Board completeness determination: November 12, 2026, 6 days left\.$/,
    )
  })

  it('warns a viewer who cannot move the meeting and leaves the vote as the step', () => {
    const plan = planWork(filed(), PLANNING, extras([]))
    expect(plan.now).toMatchObject({
      key: 'board.vote',
      action: null,
      warnings: [{ key: 'board.meeting.deadline', text: WARNING }],
    })
  })

  it('warns without offering a move when no upcoming meeting meets the deadline', () => {
    const plan = planWork(
      filed(),
      { ...PLANNING, meetings: PLANNING.meetings.slice(1) },
      extras(['set_board_meeting']),
    )
    expect(plan.now?.key).toBe('board.vote')
    expect(plan.now?.warnings.map((w) => w.text)).toEqual([
      `${WARNING} No upcoming meeting is on or before it.`,
    ])
  })

  it('does not warn once the meeting meets the deadline', () => {
    const onTime = {
      ...PLANNING,
      acceptanceMeetingId: 'm12',
      acceptanceDate: '2026-11-12',
      acceptanceText: 'November 12, 2026',
    }
    const plan = planWork(filed(), onTime, extras(['set_board_meeting']))
    expect(plan.now).toMatchObject({ key: 'board.vote', warnings: [] })
  })

  it('names the hearing meeting on a zoning board application', () => {
    const zba = { ...PLANNING, board: 'zba' as const }
    const hearing = {
      ...COMPLETENESS,
      ruleKey: 'nh.zba.hearing',
      ruleLabel: 'ZBA hearing deadline',
    }
    const plan = planWork(
      filed({ clocks: [hearing] as PlanView['clocks'] }),
      zba,
      extras(['set_board_meeting']),
    )
    expect(plan.now?.task).toBe('Move the hearing meeting')
  })
})

describe('the hearing step while a requirement before it is unmet', () => {
  const blocked = filed({
    gatesAhead: [
      {
        to: 'under_review',
        results: [gate('abutters.list_issued', 'Abutter list issued', 'No issued abutter list.')],
      },
    ],
  })
  const past = {
    ...PLANNING,
    board: 'zba' as const,
    acceptanceDate: '2026-11-02',
    acceptanceText: 'November 2, 2026',
  }

  it('asks for the abutter list and never offers opening the hearing', () => {
    const plan = planWork(blocked, past, extras(['record_board_vote']))
    expect(plan.now).toMatchObject({ key: 'abutters.list_issued', task: 'Issue the abutter list' })
    const rows = plan.groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.key === 'abutters.list_issued')?.done).toBe(false)
    expect(rows.find((r) => r.key === 'board.vote')?.action).toBeNull()
  })

  it('puts opening the draft list in the card when the viewer may manage abutter lists', () => {
    const plan = planWork(blocked, past, extras(['open_abutter_list']))
    expect(plan.now?.action).toEqual({ kind: 'open_abutter_list' })
    const rows = plan.groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.key === 'abutters.list_issued')?.action).toEqual({
      kind: 'open_abutter_list',
    })
  })

  it('offers no way to open the list to a viewer who may not manage abutter lists', () => {
    const plan = planWork(blocked, past, extras([]))
    expect(plan.now?.action).toBeNull()
  })

  it('keeps the meeting row to a check, leaving the date to the board panel', () => {
    const plan = planWork(blocked, past, extras([]))
    expect(plan.groups[0]?.rows.find((r) => r.key === 'board.meeting')).toMatchObject({
      done: true,
      detail: '',
    })
  })
})
