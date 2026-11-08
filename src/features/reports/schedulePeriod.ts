import { REPORT_FREQUENCIES } from '@/db/schema'
import type { ReportRange } from '@/features/reports/range'
import { addDays, addMonthsClamped, type CivilDate, dayOfWeek } from '@/types/civilDate'

export const SCHEDULE_FREQUENCIES = REPORT_FREQUENCIES
export type ScheduleFrequency = (typeof REPORT_FREQUENCIES)[number]

export const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  weekly: 'Every Monday, for the week before',
  monthly: 'On the first of each month, for the month before',
  quarterly: 'On the first day of each quarter, for the quarter before',
}

const MONDAY = 1
const DAYS_PER_WEEK = 7
const MONTHS_PER_QUARTER = 3

function firstOfMonth(date: CivilDate): CivilDate {
  return `${date.slice(0, 8)}01` as CivilDate
}

function firstOfQuarter(date: CivilDate): CivilDate {
  const month = Number(date.slice(5, 7))
  const quarterMonth = month - ((month - 1) % MONTHS_PER_QUARTER)
  return `${date.slice(0, 5)}${String(quarterMonth).padStart(2, '0')}-01` as CivilDate
}

export function firstRunOnOrAfter(frequency: ScheduleFrequency, date: CivilDate): CivilDate {
  if (frequency === 'weekly') {
    return addDays(date, (MONDAY - dayOfWeek(date) + DAYS_PER_WEEK) % DAYS_PER_WEEK)
  }
  const start = frequency === 'monthly' ? firstOfMonth(date) : firstOfQuarter(date)
  if (start === date) return date
  return addMonthsClamped(start, frequency === 'monthly' ? 1 : MONTHS_PER_QUARTER)
}

export function nextRunAfterSend(frequency: ScheduleFrequency, today: CivilDate): CivilDate {
  return firstRunOnOrAfter(frequency, addDays(today, 1))
}

export function periodBefore(frequency: ScheduleFrequency, runOn: CivilDate): ReportRange {
  if (frequency === 'weekly') {
    const monday = addDays(runOn, -((dayOfWeek(runOn) - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK))
    return { from: addDays(monday, -DAYS_PER_WEEK), to: addDays(monday, -1) }
  }
  const start = frequency === 'monthly' ? firstOfMonth(runOn) : firstOfQuarter(runOn)
  const months = frequency === 'monthly' ? 1 : MONTHS_PER_QUARTER
  return { from: addMonthsClamped(start, -months), to: addDays(start, -1) }
}

const MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' })
const MONTH_YEAR = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
})
const LONG_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

const utc = (date: CivilDate) => new Date(`${date}T00:00:00Z`)

export function periodLabel(frequency: ScheduleFrequency, range: ReportRange): string {
  if (frequency === 'monthly') return MONTH_YEAR.format(utc(range.from))
  if (frequency === 'quarterly') {
    return `${MONTH.format(utc(range.from))} to ${MONTH_YEAR.format(utc(range.to))}`
  }
  return `Week of ${LONG_DATE.format(utc(range.from))}`
}
