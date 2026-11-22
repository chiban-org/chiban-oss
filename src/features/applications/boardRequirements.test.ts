import { describe, expect, it } from 'vitest'
import { boardMeetingRow } from './boardRequirements'
import { type PlanView, planWork } from './workPlan'
import type { PlanActionKind, PlanBoard } from './workPlanTypes'

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

const PLANNING: PlanBoard = { ...ZONING, boardKind: 'planning_board', boardName: 'Planning Board' }

const ABILITIES: ReadonlySet<PlanActionKind> = new Set(['set_board_meeting', 'record_board_vote'])

function filed(): PlanView {
  return {
    state: 'submitted',
    isBuildingPermit: false,
    classification: 'nh.zba_variance',
    completedDate: null,
    nextTransitions: ['withdrawn'],
    allowedMoves: ['withdrawn'],
    gates: [],
    gatesAhead: [{ to: 'under_review', results: [] }],
    allowsDirectIssue: false,
    clocks: [],
    regionalImpact: { applies: false, determination: null, notices: [] },
  }
}

describe('the board rows on a filed application', () => {
  it('a filed appeals board application schedules its hearing in one row', () => {
    const plan = planWork(filed(), ZONING, {
      reviewers: 0,
      abilities: ABILITIES,
      responsible: null,
    })
    const rows = plan.groups.flatMap((g) => g.rows)
    expect(rows.filter((r) => r.key.startsWith('board.'))).toEqual([
      expect.objectContaining({
        key: 'board.meeting',
        task: 'Schedule the hearing',
        done: false,
        action: { kind: 'set_board_meeting' },
      }),
    ])
    expect(plan.now).toMatchObject({
      task: 'Schedule the hearing',
      action: { kind: 'set_board_meeting' },
    })
  })

  it('stays open after an acceptance meeting was set on the older path', () => {
    const row = boardMeetingRow(
      { ...ZONING, acceptanceMeetingId: 'm1', acceptanceDate: '2026-11-25' },
      ABILITIES,
    )
    expect(row).toMatchObject({ done: false, action: { kind: 'set_board_meeting' } })
  })

  it('a planning board keeps the acceptance meeting and the vote', () => {
    const plan = planWork({ ...filed(), classification: 'nh.pb_site_plan' }, PLANNING, {
      reviewers: 0,
      abilities: ABILITIES,
      responsible: null,
    })
    expect(
      plan.groups.flatMap((g) => g.rows).filter((r) => r.key.startsWith('board.')),
    ).toMatchObject([
      { key: 'board.meeting', task: 'Set the acceptance meeting' },
      { key: 'board.vote' },
    ])
  })
})
