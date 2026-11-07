import type { Board } from '@packs/nh/schema'
import { dueNext } from '@/features/clocks/clockSummary'
import type { ClockExplanation } from '@/features/clocks/explainClock'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { meetingIsAhead } from './boardRequirements'
import type { PlanBoard } from './workPlanTypes'

const VOTE_CLOCK: ReadonlyMap<Board, string> = new Map([
  ['planning_board', 'nh.pb.completeness'],
  ['zba', 'nh.zba.hearing'],
])

type Clock = Pick<
  ClockExplanation,
  'ruleKey' | 'ruleLabel' | 'status' | 'daysRemaining' | 'currentDue'
>

export interface MeetingDeadline {
  label: string
  due: CivilDate
}

export interface MeetingChoice {
  id: string
  date: string
  text: string
  filedInTime: boolean
}

export interface MeetingConflict {
  warning: string
  target: string | null
}

export function meetingDeadline(clocks: readonly Clock[], board: Board): MeetingDeadline | null {
  const clock = dueNext(clocks.filter((c) => c.ruleKey === VOTE_CLOCK.get(board)))
  return clock === null ? null : { label: clock.ruleLabel, due: clock.currentDue.value }
}

function meets(date: string, deadline: MeetingDeadline): boolean {
  return compareCivil(date as CivilDate, deadline.due) <= 0
}

export function meetingOptionText(meeting: MeetingChoice, deadline: MeetingDeadline | null) {
  if (!meeting.filedInTime) return `${meeting.text} · filed too late for this meeting`
  if (deadline === null) return meeting.text
  return `${meeting.text} · ${meets(meeting.date, deadline) ? 'meets the deadline' : 'after the deadline'}`
}

function noTargetReason(filedTooLate: boolean): string {
  return filedTooLate
    ? 'The application was filed too late for every meeting on or before it.'
    : 'No upcoming meeting is on or before it.'
}

type ConflictBoard = Pick<PlanBoard, 'acceptanceDate' | 'meetings' | 'today'>

export function meetingConflict(
  board: ConflictBoard,
  deadline: MeetingDeadline | null,
): MeetingConflict | null {
  const set = board.acceptanceDate
  if (deadline === null || set === null || !meetingIsAhead(board) || meets(set, deadline))
    return null
  const onTime: MeetingChoice[] = board.meetings.filter(
    (m) => m.date >= board.today && meets(m.date, deadline),
  )
  const target = onTime.filter((m) => m.filedInTime).at(-1)?.id ?? null
  const warning = `The meeting set, ${formatCivilDate(set)}, is after this deadline: ${deadline.label}, ${formatCivilDate(deadline.due)}.`
  return {
    warning: target === null ? `${warning} ${noTargetReason(onTime.length > 0)}` : warning,
    target,
  }
}
