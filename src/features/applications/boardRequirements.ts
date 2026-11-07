import type { GateResult } from '@/features/gates/evaluateGates'
import type { CoreState } from './states'
import type { NowStep, PlanActionKind, PlanBoard, Requirement } from './workPlanTypes'

type BoardFacts = Omit<PlanBoard, 'boardName' | 'meetings'>

function offered(
  kind: 'set_board_meeting' | 'record_board_vote',
  abilities: ReadonlySet<PlanActionKind>,
) {
  return abilities.has(kind) ? { kind } : null
}

export function meetingIsAhead(board: Pick<PlanBoard, 'acceptanceDate' | 'today'>): boolean {
  return board.acceptanceDate !== null && board.acceptanceDate > board.today
}

export function boardMeetingRow(
  board: BoardFacts,
  abilities: ReadonlySet<PlanActionKind>,
): Requirement {
  const planning = board.board === 'planning_board'
  const done = board.acceptanceMeetingId !== null
  return {
    key: 'board.meeting',
    label: planning ? 'Acceptance meeting set' : 'Hearing meeting set',
    done,
    detail: '',
    task: planning ? 'Set the acceptance meeting' : 'Set the hearing meeting',
    actor: 'town',
    anchor: 'board',
    action: done ? null : offered('set_board_meeting', abilities),
    gate: null,
  }
}

function voteTask(planning: boolean, ahead: boolean, meeting: string): string {
  if (ahead) {
    return planning
      ? `Vote on completeness at the meeting on ${meeting}`
      : `Vote on opening the hearing at the meeting on ${meeting}`
  }
  return planning ? 'Record the completeness vote' : 'Open the hearing'
}

export function boardVoteRow(
  board: BoardFacts,
  abilities: ReadonlySet<PlanActionKind>,
  unmet: boolean,
): Requirement {
  const planning = board.board === 'planning_board'
  const ahead = meetingIsAhead(board)
  const set = board.acceptanceMeetingId !== null
  return {
    key: 'board.vote',
    label: planning ? 'Accepted as complete' : 'Accepted for hearing',
    done: false,
    detail: '',
    task: voteTask(planning, ahead, board.acceptanceText ?? ''),
    actor: ahead || !set ? 'board' : 'town',
    anchor: 'board',
    action: set && !ahead && !unmet ? offered('record_board_vote', abilities) : null,
    gate: null,
  }
}

export function meetingStep(
  now: NowStep | null,
  board: BoardFacts | null,
  conflict: { target: string | null } | null,
  abilities: ReadonlySet<PlanActionKind>,
): NowStep | null {
  if (board === null || now?.key !== 'board.vote' || conflict?.target == null) return now
  if (!abilities.has('set_board_meeting')) return now
  return {
    key: 'board.meeting.move',
    task:
      board.board === 'planning_board' ? 'Move the acceptance meeting' : 'Move the hearing meeting',
    actor: 'town',
    note: null,
    action: { kind: 'set_board_meeting' },
    secondary: now.secondary,
    warnings: now.warnings,
  }
}

type GateGroups = readonly { to: CoreState; results: readonly GateResult[] }[]

export function hearingRequirementsUnmet(view: { gates: GateGroups; gatesAhead: GateGroups }) {
  return [...view.gates, ...view.gatesAhead]
    .filter((g) => g.to === 'under_review')
    .some((g) => g.results.some((r) => r.effective === 'blocked'))
}
