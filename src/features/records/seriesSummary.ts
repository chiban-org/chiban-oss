import type { RecordSeries } from '@packs/nh/schema'
import { computeRetention, type RetentionContext } from '@/features/records/computeRetention'

export type SeriesOutcome = 'withdrawn' | 'denied' | 'expired'

export function outcomeSeriesKey(series: RecordSeries, outcome: SeriesOutcome): string | null {
  return series.outcomes?.[outcome] ?? null
}

export function seriesSummary(series: RecordSeries, ctx: RetentionContext) {
  return {
    key: series.key,
    version: series.version,
    label: series.label,
    citation: series.citation,
    preservation: series.preservation,
    retention: computeRetention(series, ctx),
    outcomes: {
      withdrawn: outcomeSeriesKey(series, 'withdrawn'),
      denied: outcomeSeriesKey(series, 'denied'),
      expired: outcomeSeriesKey(series, 'expired'),
    },
  }
}
