import { formatCivilDate } from '@/lib/formatDate'
import { addDays, type CivilDate, daysBetween } from '@/types/civilDate'

export const TEMPORARY_USE_MAX_DAYS = 3
export const TEMPORARY_USE_PERIOD_DAYS = 30
export const TEMPORARY_USE_NOTICE_DAYS = 14

export interface UseDates {
  start: CivilDate
  end: CivilDate
}

export interface UseRequest extends UseDates {
  today: CivilDate
  others: readonly UseDates[]
}

const PERIOD_TEXT = `in any ${TEMPORARY_USE_PERIOD_DAYS}-day period`
const DAYS_TEXT = `${TEMPORARY_USE_MAX_DAYS} consecutive days`

function sharesPeriod(a: UseDates, b: UseDates): boolean {
  const first = a.start <= b.start ? a.start : b.start
  const last = a.end >= b.end ? a.end : b.end
  return daysBetween(first, last) + 1 <= TEMPORARY_USE_PERIOD_DAYS
}

function conflictText(other: UseDates): string {
  return `This lot already has a temporary use from ${formatCivilDate(other.start)} to ${formatCivilDate(other.end)}, and a lot may have at most ${DAYS_TEXT} of temporary use ${PERIOD_TEXT}.`
}

export function temporaryUseRefusals(request: UseRequest): string[] {
  const { start, end, today, others } = request
  if (end < start) return ['The end date is before the start date.']
  const refusals: string[] = []
  if (daysBetween(start, end) + 1 > TEMPORARY_USE_MAX_DAYS) {
    refusals.push(`A temporary use may run at most ${DAYS_TEXT} ${PERIOD_TEXT}.`)
  }
  if (daysBetween(today, start) < TEMPORARY_USE_NOTICE_DAYS) {
    const earliest = addDays(today, TEMPORARY_USE_NOTICE_DAYS)
    refusals.push(
      `File at least ${TEMPORARY_USE_NOTICE_DAYS} days before the start date. A filing made today can start no earlier than ${formatCivilDate(earliest)}.`,
    )
  }
  const clash = others.find((o) => sharesPeriod({ start, end }, o))
  if (clash !== undefined) refusals.push(conflictText(clash))
  return refusals
}
