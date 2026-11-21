import { AppError, ErrorIds } from '@/constants/errorIds'
import type { CivilPenaltyRule } from '@/features/packs/schema'
import { formatCents } from '@/lib/money'
import { type CivilDate, daysBetween } from '@/types/civilDate'

export const PENALTY_EXPOSURE_LABEL =
  'Estimated statutory exposure for counsel. Nothing is owed unless a court imposes it.'
export const PENALTY_EXPOSURE_AFTER_FINE_LABEL =
  'Estimated statutory exposure for counsel. Only the fines a court imposed, listed above, are owed.'

export const PENALTY_RANGE_LABEL = 'Statutory range, set by the court'

type RangeRule = Extract<CivilPenaltyRule, { model: 'range_daily' }>

export type PenaltyExposure =
  | { kind: 'computed'; fromDate: CivilDate | null; days: number; cents: number; label: string }
  | {
      kind: 'range'
      fromDate: CivilDate | null
      days: number
      label: string
      categories: RangeRule['categories']
      aggravations: RangeRule['aggravations']
    }

const EARLIER_OF = (notice: CivilDate | null, conviction: CivilDate | null): CivilDate | null =>
  [notice, conviction].filter((d): d is CivilDate => d !== null).sort()[0] ?? null

const ACCRUAL_STARTS: Partial<
  Record<string, (notice: CivilDate | null, conviction: CivilDate | null) => CivilDate | null>
> = { after_earlier_of_conviction_or_written_notice: EARLIER_OF }

function accrualStart(
  rule: CivilPenaltyRule,
  notice: CivilDate | null,
  conviction: CivilDate | null,
): CivilDate | null {
  const start = ACCRUAL_STARTS[rule.accrual]
  if (start === undefined) {
    throw new AppError(ErrorIds.ENF_INVARIANT, 'Unknown penalty accrual rule', {
      accrual: String(rule.accrual),
    })
  }
  return start(notice, conviction)
}

export function penaltyRangeLines(exposure: PenaltyExposure): string[] {
  if (exposure.kind !== 'range') return []
  return [
    ...exposure.categories.map(
      (c) =>
        `${c.label}: ${formatCents(c.minCentsPerDay)} to ${formatCents(c.maxCentsPerDay)} per day`,
    ),
    ...exposure.aggravations.map((a) =>
      a.maxCentsPerDay === undefined
        ? `${a.label}: up to ${String(a.maxMultipleOfBenefit)} times the economic benefit`
        : `${a.label}: up to ${formatCents(a.maxCentsPerDay)} per day`,
    ),
  ]
}

export function penaltyExposure(
  rule: CivilPenaltyRule,
  input: {
    noticeReceivedOn: CivilDate | null
    convictedOn: CivilDate | null
    through: CivilDate
    offense: 'first' | 'subsequent'
  },
): PenaltyExposure {
  const fromDate = accrualStart(rule, input.noticeReceivedOn, input.convictedOn)
  const days = fromDate === null ? 0 : Math.max(0, daysBetween(fromDate, input.through))
  if (rule.model === 'range_daily') {
    return {
      kind: 'range',
      fromDate,
      days,
      label: PENALTY_RANGE_LABEL,
      categories: rule.categories,
      aggravations: rule.aggravations,
    }
  }
  const perDay =
    input.offense === 'first' ? rule.firstOffenseCentsPerDay : rule.subsequentCentsPerDay
  return { kind: 'computed', fromDate, days, cents: days * perDay, label: PENALTY_EXPOSURE_LABEL }
}
