import type { ClockRule } from '@packs/nh/schema'
import type { MeetingCalendar } from '@/features/boards/calendar'
import type { DueResult } from '@/features/clocks/computeDue'
import {
  computeMeetingBoundDue,
  earliestNoticeableDate,
  type MeetingBoundDue,
  meetingBoundSpec,
} from '@/features/clocks/meetingBound'
import type { ResolvedLength } from '@/features/clocks/ruleEngine'
import type { Pack } from '@/features/packs/loadPack'
import type { CivilDate } from '@/types/civilDate'

export interface MeetingBoundTiming extends DueResult {
  detail: MeetingBoundDue
}

export async function meetingBoundTiming(
  input: {
    rule: ClockRule
    length: ResolvedLength
    onDate: CivilDate
    pack: Pack
    calendar: MeetingCalendar
    noticeLeadDays?: number | undefined
  },
  signal: AbortSignal,
): Promise<MeetingBoundTiming | null> {
  const spec = meetingBoundSpec(input.rule, input.pack)
  if (spec === null) return null
  const noticeLeadDays = input.noticeLeadDays ?? spec.noticeLeadDays
  const meeting = await input.calendar.nextRegularMeeting(
    spec.board,
    earliestNoticeableDate(input.onDate, noticeLeadDays),
    signal,
  )
  const detail = computeMeetingBoundDue({
    start: input.onDate,
    days: input.length.value,
    noticeLeadDays,
    nextRegularMeetingOnOrAfter: meeting,
  })
  return { due: detail.due, rolledFrom: null, detail }
}

export function describeMeetingBound(
  timing: MeetingBoundTiming,
  start: CivilDate,
  days: number,
): string {
  const { detail } = timing
  const limit = `${days} calendar days after ${start} is ${detail.dayLimit}.`
  const meeting =
    detail.nextNoticeableMeeting === null
      ? 'There is no regular meeting on the calendar that can be noticed in time.'
      : `The next regular meeting that can be noticed in time is ${detail.nextNoticeableMeeting}.`
  const basis =
    detail.basis === 'meeting'
      ? `The meeting comes first, so it is due then, ${detail.due}.`
      : `The day limit comes first, so it is due ${detail.due}.`
  return `${limit} ${meeting} ${basis} Does not move for weekends or holidays.`
}
