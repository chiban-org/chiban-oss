import type { HolidayCalendar } from '@/features/clocks/holidayCalendar'
import { addDays, addMonthsClamped, type CivilDate, dayOfWeek } from '@/types/civilDate'

export type ClockType = 'action_due' | 'filing_window' | 'notice_lead' | 'exercise_by'

export interface DueInput {
  start: CivilDate
  length: { unit: 'days' | 'months' | 'business_days'; value: number }
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

function stepBusinessDays(
  start: CivilDate,
  count: number,
  step: 1 | -1,
  holidays: HolidayCalendar,
): CivilDate {
  let due = start
  let remaining = count
  while (remaining > 0) {
    due = addDays(due, step)
    if (!isNonBusinessDay(due, holidays)) remaining -= 1
  }
  return due
}

export function rollsToNextBusinessDay(input: Pick<DueInput, 'clockType' | 'direction'>): boolean {
  return input.clockType === 'filing_window' && input.direction === 'after'
}

export function computeDue(input: DueInput): DueResult {
  if (input.length.unit === 'business_days') {
    const step = input.direction === 'after' ? 1 : -1
    return {
      due: stepBusinessDays(input.start, input.length.value, step, input.holidays),
      rolledFrom: null,
    }
  }
  const signed = input.direction === 'after' ? input.length.value : -input.length.value
  const raw =
    input.length.unit === 'days'
      ? addDays(input.start, signed)
      : addMonthsClamped(input.start, signed)
  if (!rollsToNextBusinessDay(input) || !isNonBusinessDay(raw, input.holidays))
    return { due: raw, rolledFrom: null }
  let due = raw
  while (isNonBusinessDay(due, input.holidays)) due = addDays(due, 1)
  return { due, rolledFrom: raw }
}
