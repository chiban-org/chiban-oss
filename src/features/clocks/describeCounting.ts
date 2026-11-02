import type { DueInput, DueResult } from '@/features/clocks/computeDue'

export interface CountingCitations {
  dayCounting: string
  businessDayRoll: string
}

export function describeCounting(
  input: DueInput,
  _result: DueResult,
  citations: CountingCitations,
): string {
  const unit = input.length.unit === 'days' ? 'calendar days' : 'calendar months'
  const relation = input.direction === 'after' ? 'after' : 'before'
  const base = `${input.length.value} ${unit} ${relation} ${input.start}. Start day excluded, last day included (${citations.dayCounting}).`
  if (input.clockType === 'filing_window') {
    return `${base} A last day on a Saturday, Sunday, or legal holiday moves to the next business day (${citations.businessDayRoll}).`
  }
  if (input.clockType === 'action_due') return `${base} Does not move for weekends or holidays.`
  return base
}
