import type { RecordEventKind, RecordSeries } from '@packs/nh/schema'
import { addMonthsClamped, type CivilDate } from '@/types/civilDate'

export type RetentionStatus =
  | { state: 'permanent' }
  | { state: 'eligible_on'; date: CivilDate }
  | { state: 'not_yet_triggered'; awaiting: RecordEventKind[] }

export interface RetentionContext {
  recordDate: CivilDate
  events: { kind: RecordEventKind; occurredOn: CivilDate }[]
}

const MONTHS_PER_YEAR = 12

export function computeRetention(series: RecordSeries, ctx: RetentionContext): RetentionStatus {
  const rule = series.retention
  if (rule.kind === 'permanent') return { state: 'permanent' }
  if (rule.kind === 'duration') {
    return {
      state: 'eligible_on',
      date: addMonthsClamped(ctx.recordDate, MONTHS_PER_YEAR * rule.years),
    }
  }
  const matching = ctx.events
    .filter((e) => rule.events.includes(e.kind))
    .map((e) => e.occurredOn)
    .sort()
  const first = matching[0]
  if (first === undefined) return { state: 'not_yet_triggered', awaiting: rule.events }
  return {
    state: 'eligible_on',
    date: addMonthsClamped(first, MONTHS_PER_YEAR * rule.plusYears),
  }
}
