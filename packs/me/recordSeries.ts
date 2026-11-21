import { ME_URLS } from '@packs/me/rules/urls'
import type { RecordSeries } from '@/features/packs/schema'

const SCHEDULES = 'Local Government Record Retention Schedules (2024)'

function sectionA(series: string): RecordSeries['citation'] {
  return { label: `${SCHEDULES}, ${series}`, url: ME_URLS.retentionSectionA }
}

export const ME_RECORD_SERIES: RecordSeries[] = [
  {
    key: 'me.rs.foaa_requests',
    version: 1,
    label: 'Freedom of Access Act requests',
    citation: sectionA('LG1.12'),
    retention: { kind: 'event', events: ['request_completed'], plusYears: 1 },
    preservation: 'original',
  },
  {
    key: 'me.rs.citizen_complaints',
    version: 1,
    label: 'Citizen complaints',
    citation: sectionA('LG1.6'),
    retention: { kind: 'event', events: ['case_closed'], plusYears: 3 },
    preservation: 'original',
  },
  {
    key: 'me.rs.enforcement_files',
    version: 1,
    label: 'Enforcement files: court filings, proofs of service and orders',
    citation: { label: `${SCHEDULES}, Introduction p.5`, url: ME_URLS.retentionIntroduction },
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
]

export const ME_RECORD_SERIES_DEFAULTS = {
  byClassification: {} as Record<string, string>,
  byApplicationType: {} as Record<string, string>,
}
