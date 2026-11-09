import { formatMinuteOfDay } from '@/features/hearings/labels'
import type { CivilDate } from '@/types/civilDate'

export interface MeetingTime {
  meetingDate: CivilDate | string
  startsAtMinute: number
}

export interface MeetingPlace extends MeetingTime {
  location: string
}

const WEEKDAY_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

export function meetingWhen(meeting: MeetingTime): string {
  const day = WEEKDAY_DATE.format(new Date(`${meeting.meetingDate}T00:00:00Z`))
  return `${day} at ${formatMinuteOfDay(meeting.startsAtMinute)}`
}

export function meetingWhenAndWhere(meeting: MeetingPlace): string {
  const where = meeting.location.trim()
  return where === '' ? meetingWhen(meeting) : `${meetingWhen(meeting)}, ${where}`
}

export function packetWhen(view: {
  meetingDate: CivilDate | string
  place: { startsAtMinute: number; location: string } | null
}): string {
  return view.place === null
    ? WEEKDAY_DATE.format(new Date(`${view.meetingDate}T00:00:00Z`))
    : meetingWhenAndWhere({ meetingDate: view.meetingDate, ...view.place })
}
