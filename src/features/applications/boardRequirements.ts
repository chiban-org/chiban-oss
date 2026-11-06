import type { PlanActionKind, PlanBoard, Requirement } from './workPlanTypes'

type BoardFacts = Omit<PlanBoard, 'boardName'>

function offered(
  kind: 'set_board_meeting' | 'record_board_vote',
  abilities: ReadonlySet<PlanActionKind>,
) {
  return abilities.has(kind) ? { kind } : null
}

export function meetingIsAhead(board: BoardFacts): boolean {
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
    detail: done ? (board.acceptanceText ?? '') : '',
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
    action: set && !ahead ? offered('record_board_vote', abilities) : null,
    gate: null,
  }
}
