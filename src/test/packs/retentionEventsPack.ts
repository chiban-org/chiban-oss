import { NH_PACK } from '@packs/nh'
import type { RecordSeries, StatePack } from '@/features/packs/schema'

const SCHEDULE = { label: 'Fernhollow records schedule', url: 'https://laws.example/fernhollow' }

export const REQUEST_LETTER_SERIES: RecordSeries = {
  key: 'test.rs.request_letters',
  version: 1,
  label: 'Records request letters',
  citation: SCHEDULE,
  retention: { kind: 'event', events: ['request_completed'], plusYears: 1 },
  preservation: 'original',
}

export const PERMIT_FILE_SERIES: RecordSeries = {
  key: 'test.rs.permit_files',
  version: 1,
  label: 'Permit and case files',
  citation: SCHEDULE,
  retention: {
    kind: 'event',
    events: [
      'permit_expired',
      'occupancy_certificate_issued',
      'final_inspection_passed',
      'case_closed',
    ],
    plusYears: 3,
  },
  preservation: 'original',
}

export const RETENTION_EVENTS_PACK: StatePack = {
  ...NH_PACK,
  manifest: {
    ...NH_PACK.manifest,
    recordSeries: [...NH_PACK.manifest.recordSeries, REQUEST_LETTER_SERIES, PERMIT_FILE_SERIES],
  },
}
