import type { ClockRule } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { computeDue } from '@/features/clocks/computeDue'
import { type CountingCitations, describeCounting } from '@/features/clocks/describeCounting'
import type { HolidayCalendar } from '@/features/clocks/holidayCalendar'
import { type CivilDate, daysBetween } from '@/types/civilDate'

export interface SubjectDue {
  ruleKey: string
  ruleVersion: number
  packVersion: string
  startEvent: string
  startDate: CivilDate
  countingMethod: string
  due: CivilDate
  rolledFrom: CivilDate | null
  consequence: string
}

export interface SubjectDueContext {
  holidays: HolidayCalendar
  packVersion: string
  citations: CountingCitations
}

export function computeSubjectDue(
  rule: ClockRule,
  startDate: CivilDate,
  ctx: SubjectDueContext,
): SubjectDue {
  const length = rule.length
  if ('cases' in length || 'fromSetting' in length) {
    throw new AppError(ErrorIds.PACK_INVALID, 'Subject due dates need a fixed-length rule', {
      key: rule.key,
    })
  }
  const input = {
    start: startDate,
    length: { unit: length.unit, value: length.value },
    direction: rule.direction,
    clockType: rule.clockType,
    holidays: ctx.holidays,
  }
  const result = computeDue(input)
  return {
    ruleKey: rule.key,
    ruleVersion: rule.version,
    packVersion: ctx.packVersion,
    startEvent: rule.startEvent,
    startDate,
    countingMethod: describeCounting(input, result, ctx.citations),
    due: result.due,
    rolledFrom: result.rolledFrom,
    consequence: rule.consequence.text,
  }
}

export function subjectDueStatus(
  d: SubjectDue,
  today: CivilDate,
): { status: 'running' | 'due_today' | 'passed'; daysRemaining: number } {
  const daysRemaining = daysBetween(today, d.due)
  if (daysRemaining > 0) return { status: 'running', daysRemaining }
  if (daysRemaining === 0) return { status: 'due_today', daysRemaining }
  return { status: 'passed', daysRemaining }
}
