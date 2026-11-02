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

function statedDateDue(
  rule: ClockRule,
  startDate: CivilDate,
  ctx: SubjectDueContext,
  statedDue: CivilDate | undefined,
): SubjectDue {
  if (statedDue === undefined || daysBetween(startDate, statedDue) < 0) {
    throw new AppError(ErrorIds.PACK_INVALID, 'A stated date must be on or after the statement', {
      key: rule.key,
    })
  }
  return {
    ruleKey: rule.key,
    ruleVersion: rule.version,
    packVersion: ctx.packVersion,
    startEvent: rule.startEvent,
    startDate,
    countingMethod: `The date the town stated in writing, ${statedDue}. No counting applies.`,
    due: statedDue,
    rolledFrom: null,
    consequence: rule.consequence.text,
  }
}

export function computeSubjectDue(
  rule: ClockRule,
  startDate: CivilDate,
  ctx: SubjectDueContext,
  opts?: { statedDue?: CivilDate },
): SubjectDue {
  const length = rule.length
  if ('cases' in length || 'fromSetting' in length) {
    throw new AppError(ErrorIds.PACK_INVALID, 'Subject due dates need a fixed-length rule', {
      key: rule.key,
    })
  }
  if (length.unit === 'stated_date') return statedDateDue(rule, startDate, ctx, opts?.statedDue)
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
