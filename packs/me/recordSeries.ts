import { ME_URLS } from '@packs/me/rules/urls'
import type { RecordSeries } from '@/features/packs/schema'

const SCHEDULES = 'Local Government Record Retention Schedules (2024)'
export const UNSCHEDULED = 'me.rs.unscheduled_permanent'

function sectionA(series: string): RecordSeries['citation'] {
  return { label: `${SCHEDULES}, ${series}`, url: ME_URLS.retentionSectionA }
}

function sectionB(series: string): RecordSeries['citation'] {
  return { label: `${SCHEDULES}, ${series}`, url: ME_URLS.retentionSectionB }
}

export const ME_RECORD_SERIES: RecordSeries[] = [
  {
    key: 'me.rs.building_permits',
    version: 1,
    label: 'Building permit and file information',
    citation: sectionA('LG6.24a'),
    retention: { kind: 'event', events: ['building_removed'], plusYears: 1 },
    preservation: 'pdfa',
    outcomes: {
      withdrawn: 'me.rs.building_never_built',
      denied: 'me.rs.building_never_built',
      expired: 'me.rs.building_never_built',
    },
  },
  {
    key: 'me.rs.building_plans',
    version: 1,
    label: 'Building plans and specifications',
    citation: sectionA('LG6.24b'),
    retention: { kind: 'event', events: ['occupancy_certificate_issued'], plusYears: 6 },
    preservation: 'pdfa',
  },
  {
    key: 'me.rs.building_never_built',
    version: 1,
    label: 'Building applications never built',
    citation: sectionA('LG6.23'),
    retention: {
      kind: 'event',
      events: ['application_withdrawn', 'application_denied', 'permit_expired'],
      plusYears: 6,
    },
    preservation: 'original',
  },
  {
    key: 'me.rs.seasonal_conversion',
    version: 1,
    label: 'Conversion of seasonal dwelling',
    citation: sectionA('LG6.25'),
    retention: { kind: 'event', events: ['building_removed'], plusYears: 0 },
    preservation: 'pdfa',
  },
  {
    key: 'me.rs.plumbing_external',
    version: 1,
    label: 'Plumbing permits for work outside the building',
    citation: sectionA('LG6.32a'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: 'me.rs.plumbing_internal',
    version: 1,
    label: 'Plumbing permits for work inside the building',
    citation: sectionA('LG6.32b'),
    retention: { kind: 'event', events: ['final_inspection_passed'], plusYears: 4 },
    preservation: 'original',
  },
  {
    key: 'me.rs.subdivision_permits',
    version: 1,
    label: 'Subdivision permits',
    citation: sectionA('LG6.36a'),
    retention: { kind: 'event', events: ['permit_expired'], plusYears: 3 },
    preservation: 'original',
  },
  {
    key: 'me.rs.subdivision_plans',
    version: 1,
    label: 'Subdivision plans',
    citation: sectionA('LG6.36b'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: 'me.rs.site_plans_approved',
    version: 1,
    label: 'Site plans, approved',
    citation: sectionB('LG12.10a'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: 'me.rs.board_of_appeals_files',
    version: 1,
    label: 'Board of appeals files',
    citation: sectionA('LG10.2'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: 'me.rs.board_minutes',
    version: 1,
    label: 'Minutes of meetings of boards and commissions',
    citation: sectionA('LG10.6'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: 'me.rs.zoning_permits',
    version: 1,
    label: 'Zoning permits, including shoreland zoning',
    citation: sectionA('LG6.40'),
    retention: { kind: 'event', events: ['permit_expired'], plusYears: 3 },
    preservation: 'original',
  },
  {
    key: 'me.rs.inspections_order',
    version: 1,
    label: 'Municipal inspection files, order resulting',
    citation: sectionB('LG12.8b'),
    retention: { kind: 'event', events: ['case_closed'], plusYears: 3 },
    preservation: 'original',
  },
  {
    key: 'me.rs.inspections_no_order',
    version: 1,
    label: 'Municipal inspection files, no order resulting',
    citation: sectionB('LG12.8a'),
    retention: { kind: 'duration', years: 3 },
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
    key: 'me.rs.foaa_requests',
    version: 1,
    label: 'Freedom of Access Act requests',
    citation: sectionA('LG1.12'),
    retention: { kind: 'event', events: ['request_completed'], plusYears: 1 },
    preservation: 'original',
  },
  {
    key: 'me.rs.driveway_permits',
    version: 1,
    label: 'Driveway permits',
    citation: sectionA('LG6.27'),
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: 'me.rs.enforcement_files',
    version: 1,
    label: 'Enforcement files: court filings, proofs of service and orders',
    citation: { label: `${SCHEDULES}, Introduction p.5`, url: ME_URLS.retentionIntroduction },
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
  {
    key: UNSCHEDULED,
    version: 1,
    label: 'No schedule entry: kept permanently',
    citation: { label: `${SCHEDULES}, Introduction p.5`, url: ME_URLS.retentionIntroduction },
    retention: { kind: 'permanent' },
    preservation: 'pdfa',
  },
]

export const ME_RECORD_SERIES_DEFAULTS = {
  byClassification: {
    'me.building_permit': 'me.rs.building_permits',
  } as Record<string, string>,
  byApplicationType: {
    SSW: 'me.rs.plumbing_external',
  } as Record<string, string>,
}
