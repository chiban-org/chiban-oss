import { type DueInput, type DueResult, rollsToNextBusinessDay } from '@/features/clocks/computeDue'

export interface CountingCitations {
  dayCounting: string
  businessDayRoll: string
}

export function describeCounting(
  input: DueInput,
  _result: DueResult,
  citations: CountingCitations,
): string {
  const relation = input.direction === 'after' ? 'after' : 'before'
  if (input.length.unit === 'business_days') {
    return `${input.length.value} business days ${relation} ${input.start}. Start day excluded. Saturdays, Sundays, and legal holidays are not counted (${citations.businessDayRoll}). Does not move after counting.`
  }
  const unit = input.length.unit === 'days' ? 'calendar days' : 'calendar months'
  const base = `${input.length.value} ${unit} ${relation} ${input.start}. Start day excluded, last day included (${citations.dayCounting}).`
  if (rollsToNextBusinessDay(input)) {
    return `${base} A last day on a Saturday, Sunday, or legal holiday moves to the next business day (${citations.businessDayRoll}).`
  }
  if (input.clockType === 'action_due' || input.clockType === 'filing_window')
    return `${base} Does not move for weekends or holidays.`
  return base
}
