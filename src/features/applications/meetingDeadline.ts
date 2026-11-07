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
  noticeable: boolean
}

export interface MeetingConflict {
  warning: string
  target: string | null
}

export function voteClockKey(board: Board): string {
  return VOTE_CLOCK.get(board) ?? ''
}

export function meetingDeadline(clocks: readonly Clock[], board: Board): MeetingDeadline | null {
  const clock = dueNext(clocks.filter((c) => c.ruleKey === VOTE_CLOCK.get(board)))
  return clock === null ? null : { label: clock.ruleLabel, due: clock.currentDue.value }
}

function meets(date: string, deadline: MeetingDeadline): boolean {
  return compareCivil(date as CivilDate, deadline.due) <= 0
}

type Mark = 'filed_too_late' | 'too_soon' | 'meets' | 'after'

const OPTION_MARK: ReadonlyMap<Mark, string> = new Map([
  ['filed_too_late', 'filed too late for this meeting'],
  ['too_soon', 'too soon to mail notice'],
  ['meets', 'meets the deadline'],
  ['after', 'after the deadline'],
])

const HINT: ReadonlyMap<Mark, string> = new Map([
  ['filed_too_late', 'The application was filed too late for this meeting.'],
  ['too_soon', 'It is too soon to mail notice for this meeting.'],
  ['meets', 'This meeting meets the deadline.'],
  ['after', 'This meeting is after the deadline.'],
])

function markOf(meeting: MeetingChoice, deadline: MeetingDeadline | null): Mark | null {
  if (!meeting.filedInTime) return 'filed_too_late'
  if (!meeting.noticeable) return 'too_soon'
  if (deadline === null) return null
  return meets(meeting.date, deadline) ? 'meets' : 'after'
}

export function meetingOptionText(meeting: MeetingChoice, deadline: MeetingDeadline | null) {
  const mark = markOf(meeting, deadline)
  return mark === null ? meeting.text : `${meeting.text} · ${OPTION_MARK.get(mark) ?? ''}`
}

export function meetingHint(meeting: MeetingChoice, deadline: MeetingDeadline | null) {
  const mark = markOf(meeting, deadline)
  return mark === null ? undefined : HINT.get(mark)
}

function noTargetReason(onTime: readonly MeetingChoice[]): string {
  if (onTime.length === 0) return 'No upcoming meeting is on or before it.'
  return onTime.some((m) => m.filedInTime)
    ? 'There is not enough time left to mail notice for any meeting on or before it.'
    : 'The application was filed too late for every meeting on or before it.'
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
  const target = onTime.filter((m) => m.filedInTime && m.noticeable).at(-1)?.id ?? null
  const warning = `The meeting set, ${formatCivilDate(set)}, is after this deadline: ${deadline.label}, ${formatCivilDate(deadline.due)}.`
  return {
    warning: target === null ? `${warning} ${noTargetReason(onTime)}` : warning,
    target,
  }
}
