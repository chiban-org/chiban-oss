import type { HolidayCalendar } from '@/features/clocks/holidayCalendar'
import { addDays, addMonthsClamped, type CivilDate, dayOfWeek } from '@/types/civilDate'

export type ClockType = 'action_due' | 'filing_window' | 'notice_lead' | 'exercise_by'

export interface DueInput {
  start: CivilDate
  length: { unit: 'days' | 'months'; value: number }
  direction: 'after' | 'before'
  clockType: ClockType
  holidays: HolidayCalendar
}

export interface DueResult {
  due: CivilDate
  rolledFrom: CivilDate | null
}

function isNonBusinessDay(d: CivilDate, holidays: HolidayCalendar): boolean {
  const dow = dayOfWeek(d)
  return dow === 0 || dow === 6 || holidays.isHoliday(d)
}

export function computeDue(input: DueInput): DueResult {
  const signed = input.direction === 'after' ? input.length.value : -input.length.value
  const raw =
    input.length.unit === 'days'
      ? addDays(input.start, signed)
      : addMonthsClamped(input.start, signed)
  const rolls = input.clockType === 'filing_window' && input.direction === 'after'
  if (!rolls || !isNonBusinessDay(raw, input.holidays)) return { due: raw, rolledFrom: null }
  let due = raw
  while (isNonBusinessDay(due, input.holidays)) due = addDays(due, 1)
  return { due, rolledFrom: raw }
}
