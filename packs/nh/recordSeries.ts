import type { RecordSeries } from '@packs/nh/schema'

const UNSCHEDULED = 'nh.rs.unscheduled_permanent'
const STATUTE_URL = 'https://gc.nh.gov/rsa/html/III/33-A/33-A-3-a.htm'

function cite(numeral: string): RecordSeries['citation'] {
  return { label: `RSA 33-A:3-a ${numeral}`, url: STATUTE_URL }
}

export const NH_RECORD_SERIES: RecordSeries[] = [
  {
    key: 'nh.rs.building_permits',
    version: 1,
    label: 'Building permits: applications and approvals',
    citation: cite('XV'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
    outcomes: {
      withdrawn: 'nh.rs.building_permits_withdrawn_denied',
      denied: 'nh.rs.building_permits_withdrawn_denied',
      expired: 'nh.rs.building_permits_lapsed',
    },
  },
  {
    key: 'nh.rs.building_permits_lapsed',
    version: 1,
    label: 'Building permits: lapsed',
    citation: cite('XVI'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: 'nh.rs.building_permits_withdrawn_denied',
    version: 1,
    label: 'Building permits: withdrawn or denied applications',
    citation: cite('XVII'),
    retention: {
      kind: 'event',
      events: ['application_withdrawn', 'application_denied'],
      plusYears: 1,
    },
    preservation: 'original',
  },
  {
    key: 'nh.rs.blueprints_architectural',
    version: 1,
    label: 'Blueprints, architectural: life of building',
    citation: cite('XI'),
    retention: { kind: 'event', events: ['building_removed'], plusYears: 0 },
    preservation: 'pdfa',
  },
  {
    key: 'nh.rs.correspondence_administrative',
    version: 1,
    label: 'Correspondence: administrative',
    citation: cite('XXV'),
    retention: { kind: 'duration', years: 1 },
    preservation: 'original',
  },
  {
    key: 'nh.rs.driveway_permits',
    version: 1,
    label: 'Driveway permits',
    citation: cite('XXXIV'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: 'nh.rs.licenses_other',
    version: 1,
    label: 'Licenses and registrations: duration plus 1 year',
    citation: cite('LXVII'),
    retention: { kind: 'event', events: ['registration_expired'], plusYears: 1 },
    preservation: 'original',
  },
  {
    key: 'nh.rs.septic_plans',
    version: 1,
    label: 'Septic plans: until replaced or removed',
    citation: cite('CXX'),
    retention: { kind: 'event', events: ['septic_replaced_or_removed'], plusYears: 0 },
    preservation: 'pdfa',
  },
  {
    key: 'nh.rs.complaint_log',
    version: 1,
    label: 'Complaints: until the appeal period has expired',
    citation: cite('XXII'),
    retention: { kind: 'event', events: ['appeal_period_expired'], plusYears: 0 },
    preservation: 'original',
  },
  {
    key: 'nh.rs.code_enforcement_specifications',
    version: 1,
    label: 'Code enforcement: orders, findings, and proof of service',
    citation: cite('XXI'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: UNSCHEDULED,
    version: 1,
    label: 'No schedule entry: kept permanently pending review',
    citation: { label: 'RSA 33-A:3-a', url: STATUTE_URL },
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
]

export const RECORD_SERIES_DEFAULTS = {
  byClassification: {
    'nh.building_permit': 'nh.rs.building_permits',
    'nh.trade_permit': 'nh.rs.building_permits',
  },
  byApplicationType: {
    DW: 'nh.rs.driveway_permits',
    AR: 'nh.rs.licenses_other',
    STR: 'nh.rs.licenses_other',
    SC: 'nh.rs.septic_plans',
    SG: UNSCHEDULED,
    HO: UNSCHEDULED,
    SA: UNSCHEDULED,
    CO: UNSCHEDULED,
    TS: UNSCHEDULED,
  } as Record<string, string>,
}
