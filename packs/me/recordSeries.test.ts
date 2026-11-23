import { ME_RECORD_SERIES, ME_RECORD_SERIES_DEFAULTS } from '@packs/me/recordSeries'
import { ME_ROLES } from '@packs/me/roles'
import { ME_URLS } from '@packs/me/rules/urls'
import { describe, expect, it } from 'vitest'
import { RecordSeriesSchema } from '@/features/packs/schema'
import { computeRetention } from '@/features/records/computeRetention'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const seriesOf = (key: string) => {
  const found = ME_RECORD_SERIES.find((s) => s.key === key)
  if (found === undefined) throw new Error(`no series ${key}`)
  return found
}

const SCHEDULES = 'Local Government Record Retention Schedules (2024)'
const SCHEDULED = ME_RECORD_SERIES.filter((s) => s.key !== 'me.rs.unscheduled_permanent')

describe('ME record series', () => {
  it('every series parses and cites the 2024 schedules with a series number and a PDF url', () => {
    for (const series of ME_RECORD_SERIES) {
      expect(RecordSeriesSchema.safeParse(series).success).toBe(true)
      expect(series.citation.label.startsWith(`${SCHEDULES}, `)).toBe(true)
      expect(series.citation.url.endsWith('.pdf')).toBe(true)
    }
    for (const series of SCHEDULED.filter((s) => s.key !== 'me.rs.enforcement_files')) {
      expect(series.citation.label).toMatch(/, LG\d+\.\d+[ab]?$/)
    }
  })

  it('series numbers are unique and match the schedule', () => {
    const numbers = Object.fromEntries(
      ME_RECORD_SERIES.map((s) => [s.key, s.citation.label.split(', ').at(-1)]),
    )
    expect(numbers).toMatchObject({
      'me.rs.building_permits': 'LG6.24a',
      'me.rs.building_plans': 'LG6.24b',
      'me.rs.building_never_built': 'LG6.23',
      'me.rs.seasonal_conversion': 'LG6.25',
      'me.rs.plumbing_external': 'LG6.32a',
      'me.rs.plumbing_internal': 'LG6.32b',
      'me.rs.subdivision_permits': 'LG6.36a',
      'me.rs.subdivision_plans': 'LG6.36b',
      'me.rs.site_plans_approved': 'LG12.10a',
      'me.rs.board_of_appeals_files': 'LG10.2',
      'me.rs.board_minutes': 'LG10.6',
      'me.rs.zoning_permits': 'LG6.40',
      'me.rs.inspections_order': 'LG12.8b',
      'me.rs.inspections_no_order': 'LG12.8a',
      'me.rs.citizen_complaints': 'LG1.6',
      'me.rs.foaa_requests': 'LG1.12',
      'me.rs.driveway_permits': 'LG6.27',
    })
    const labels = SCHEDULED.map((s) => s.citation.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('Schedule 12 series cite Section B and the rest cite Section A', () => {
    for (const series of SCHEDULED) {
      if (series.key === 'me.rs.enforcement_files') continue
      const sectionB = /, LG12\./.test(series.citation.label)
      expect(series.citation.url).toBe(
        sectionB ? ME_URLS.retentionSectionB : ME_URLS.retentionSectionA,
      )
    }
  })

  it('series keys are unique', () => {
    const keys = ME_RECORD_SERIES.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every outcome target, default and role exists', () => {
    const keys = new Set(ME_RECORD_SERIES.map((s) => s.key))
    for (const series of ME_RECORD_SERIES) {
      for (const target of Object.values(series.outcomes ?? {})) expect(keys.has(target)).toBe(true)
    }
    for (const key of Object.values(ME_RECORD_SERIES_DEFAULTS.byClassification)) {
      expect(keys.has(key)).toBe(true)
    }
    for (const key of Object.values(ME_RECORD_SERIES_DEFAULTS.byApplicationType)) {
      expect(keys.has(key)).toBe(true)
    }
    const roles = ME_ROLES.recordSeries
    for (const key of [
      roles.rtkCorrespondence,
      roles.complaintLog,
      roles.codeEnforcementFiles,
      ...roles.publicParcelFiles,
    ]) {
      expect(keys.has(key)).toBe(true)
    }
  })

  it('withdrawn and denied building permits go to the never-built series', () => {
    const outcomes = seriesOf('me.rs.building_permits').outcomes
    expect(outcomes?.withdrawn).toBe('me.rs.building_never_built')
    expect(outcomes?.denied).toBe('me.rs.building_never_built')
    expect(outcomes?.expired).toBeUndefined()
    expect(seriesOf('me.rs.building_never_built').retention).toEqual({
      kind: 'event',
      events: ['application_withdrawn', 'application_denied', 'permit_expired'],
      plusYears: 6,
    })
  })

  it('subsurface wastewater files under external plumbing and building permits under LG6.24a', () => {
    expect(ME_RECORD_SERIES_DEFAULTS.byApplicationType.SSW).toBe('me.rs.plumbing_external')
    expect(ME_RECORD_SERIES_DEFAULTS.byClassification['me.building_permit']).toBe(
      'me.rs.building_permits',
    )
  })

  it('FOAA retention waits for request_completed', () => {
    const series = seriesOf('me.rs.foaa_requests')
    expect(computeRetention(series, { recordDate: d('2027-05-01'), events: [] })).toEqual({
      state: 'not_yet_triggered',
      awaiting: ['request_completed'],
    })
    expect(
      computeRetention(series, {
        recordDate: d('2027-05-01'),
        events: [{ kind: 'request_completed', occurredOn: d('2027-06-10') }],
      }),
    ).toEqual({ state: 'eligible_on', date: '2028-06-10' })
  })

  it('building plans are eligible six years after the certificate of occupancy', () => {
    const series = seriesOf('me.rs.building_plans')
    expect(
      computeRetention(series, {
        recordDate: d('2027-05-01'),
        events: [{ kind: 'occupancy_certificate_issued', occurredOn: d('2028-03-15') }],
      }),
    ).toEqual({ state: 'eligible_on', date: '2034-03-15' })
  })

  it('pins the retention of every series', () => {
    const ev = (events: string[], plusYears: number) => ({ kind: 'event', events, plusYears })
    const permanent = { kind: 'permanent' }
    const expected: Record<string, unknown> = {
      'me.rs.building_permits': ev(['building_removed'], 1),
      'me.rs.building_plans': ev(['occupancy_certificate_issued'], 6),
      'me.rs.building_never_built': ev(
        ['application_withdrawn', 'application_denied', 'permit_expired'],
        6,
      ),
      'me.rs.seasonal_conversion': ev(['building_removed'], 0),
      'me.rs.plumbing_external': permanent,
      'me.rs.plumbing_internal': ev(['final_inspection_passed'], 4),
      'me.rs.subdivision_permits': ev(['permit_expired'], 3),
      'me.rs.subdivision_plans': permanent,
      'me.rs.site_plans_approved': permanent,
      'me.rs.board_of_appeals_files': permanent,
      'me.rs.board_minutes': permanent,
      'me.rs.zoning_permits': ev(['permit_expired'], 3),
      'me.rs.inspections_order': ev(['case_closed'], 3),
      'me.rs.inspections_no_order': { kind: 'duration', years: 3 },
      'me.rs.citizen_complaints': ev(['case_closed'], 3),
      'me.rs.foaa_requests': ev(['request_completed'], 1),
      'me.rs.driveway_permits': permanent,
      'me.rs.enforcement_files': permanent,
      'me.rs.unscheduled_permanent': permanent,
    }
    expect(Object.keys(expected).sort()).toEqual(ME_RECORD_SERIES.map((s) => s.key).sort())
    for (const series of ME_RECORD_SERIES) expect(series.retention).toEqual(expected[series.key])
  })

  it('only inspections_no_order uses duration', () => {
    const durations = ME_RECORD_SERIES.filter((s) => s.retention.kind === 'duration')
    expect(durations.map((s) => s.key)).toEqual(['me.rs.inspections_no_order'])
    expect(durations[0]?.retention).toEqual({ kind: 'duration', years: 3 })
  })

  it('permanent series', () => {
    const permanent = ME_RECORD_SERIES.filter((s) => s.retention.kind === 'permanent').map(
      (s) => s.key,
    )
    expect(permanent.sort()).toEqual(
      [
        'me.rs.plumbing_external',
        'me.rs.subdivision_plans',
        'me.rs.site_plans_approved',
        'me.rs.board_of_appeals_files',
        'me.rs.board_minutes',
        'me.rs.driveway_permits',
        'me.rs.enforcement_files',
        'me.rs.unscheduled_permanent',
      ].sort(),
    )
  })

  it('unscheduled and enforcement series cite the Introduction page 5', () => {
    for (const key of ['me.rs.unscheduled_permanent', 'me.rs.enforcement_files']) {
      expect(seriesOf(key).citation).toEqual({
        label: `${SCHEDULES}, Introduction p.5`,
        url: ME_URLS.retentionIntroduction,
      })
    }
  })
})
