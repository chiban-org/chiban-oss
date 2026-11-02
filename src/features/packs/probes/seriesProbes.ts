import type { RecordSeries } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { loadPack } from '@/features/packs/loadPack'
import { type FieldProbe, probe } from '@/features/packs/probes/probe'
import { seriesSummary } from '@/features/records/seriesSummary'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

const SAMPLE = {
  recordDate: d('2027-01-15'),
  events: [
    { kind: 'application_withdrawn' as const, occurredOn: d('2027-05-03') },
    { kind: 'application_denied' as const, occurredOn: d('2027-08-09') },
    { kind: 'building_removed' as const, occurredOn: d('2040-06-01') },
  ],
}

function seriesOf(key: string): RecordSeries {
  const found = loadPack().recordSeries.find((s) => s.key === key)
  if (found === undefined) throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, `no series ${key}`)
  return found
}

function seriesProbe(baseKey: string, mutate: (s: RecordSeries) => RecordSeries): FieldProbe {
  return probe<RecordSeries>({
    base: () => seriesOf(baseKey),
    mutate,
    observe: (s) => seriesSummary(s, SAMPLE),
  })
}

const PERMITS = 'nh.rs.building_permits'
const EVENT_SERIES = 'nh.rs.building_permits_withdrawn_denied'
const DURATION_SERIES = 'nh.rs.correspondence_administrative'

export function seriesProbes(): Record<string, FieldProbe> {
  return {
    'record_series.key': seriesProbe(PERMITS, (s) => ({ ...s, key: 'changed' })),
    'record_series.version': seriesProbe(PERMITS, (s) => ({ ...s, version: s.version + 1 })),
    'record_series.label': seriesProbe(PERMITS, (s) => ({ ...s, label: 'Changed' })),
    'record_series.citation.label': seriesProbe(PERMITS, (s) => ({
      ...s,
      citation: { ...s.citation, label: 'Changed' },
    })),
    'record_series.citation.url': seriesProbe(PERMITS, (s) => ({
      ...s,
      citation: { ...s.citation, url: 'https://example.test/c' },
    })),
    'record_series.preservation': seriesProbe(PERMITS, (s) => ({ ...s, preservation: 'original' })),
    'record_series.outcomes.withdrawn': seriesProbe(PERMITS, (s) => ({
      ...s,
      outcomes: { ...s.outcomes, withdrawn: 'changed' },
    })),
    'record_series.outcomes.denied': seriesProbe(PERMITS, (s) => ({
      ...s,
      outcomes: { ...s.outcomes, denied: 'changed' },
    })),
    'record_series.outcomes.expired': seriesProbe(PERMITS, (s) => ({
      ...s,
      outcomes: { ...s.outcomes, expired: 'changed' },
    })),
    'record_series.retention.kind': seriesProbe(PERMITS, (s) => ({
      ...s,
      retention: { kind: 'duration', years: 3 },
    })),
    'record_series.retention.years': seriesProbe(DURATION_SERIES, (s) => ({
      ...s,
      retention: { kind: 'duration', years: 5 },
    })),
    'record_series.retention.events': seriesProbe(EVENT_SERIES, (s) => ({
      ...s,
      retention: { kind: 'event', events: ['building_removed'], plusYears: 1 },
    })),
    'record_series.retention.plusYears': seriesProbe(EVENT_SERIES, (s) => ({
      ...s,
      retention: {
        kind: 'event',
        events: ['application_withdrawn', 'application_denied'],
        plusYears: 4,
      },
    })),
  }
}
