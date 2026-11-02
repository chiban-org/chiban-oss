import type { RecordSeries } from '@packs/nh/schema'

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
]

export const RECORD_SERIES_DEFAULTS = {
  byClassification: {
    'nh.building_permit': 'nh.rs.building_permits',
    'nh.trade_permit': 'nh.rs.building_permits',
  },
}
