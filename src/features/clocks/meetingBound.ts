import type { Board, ClockRule } from '@packs/nh/schema'
import { type Pack, ruleByKey } from '@/features/packs/loadPack'
import { addDays, type CivilDate, compareCivil } from '@/types/civilDate'

export interface MeetingBoundSpec {
  board: Board
  days: number
  noticeLeadDays: number
}

export function meetingBoundSpec(rule: ClockRule, pack: Pack): MeetingBoundSpec | null {
  const length = rule.length
  if (!('earlierOfNextRegularMeeting' in length)) return null
  const { board, noticeRuleKey } = length.earlierOfNextRegularMeeting
  const notice = ruleByKey(pack, noticeRuleKey)
  const noticeLeadDays =
    notice.kind === 'clock' && 'value' in notice.length ? notice.length.value : 0
  return { board, days: length.value, noticeLeadDays }
}

export interface MeetingBoundInput {
  start: CivilDate
  days: number
  noticeLeadDays: number
  nextRegularMeetingOnOrAfter: CivilDate | null
}

export interface MeetingBoundDue {
  due: CivilDate
  nextNoticeableMeeting: CivilDate | null
  dayLimit: CivilDate
  basis: 'meeting' | 'day_limit'
}

export function earliestNoticeableDate(start: CivilDate, noticeLeadDays: number): CivilDate {
  return addDays(start, noticeLeadDays)
}

export function computeMeetingBoundDue(input: MeetingBoundInput): MeetingBoundDue {
  const dayLimit = addDays(input.start, input.days)
  const meeting = input.nextRegularMeetingOnOrAfter
  if (meeting === null || compareCivil(meeting, dayLimit) > 0) {
    return { due: dayLimit, nextNoticeableMeeting: meeting, dayLimit, basis: 'day_limit' }
  }
  return { due: meeting, nextNoticeableMeeting: meeting, dayLimit, basis: 'meeting' }
}
