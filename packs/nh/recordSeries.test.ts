import { NH_RECORD_SERIES, RECORD_SERIES_DEFAULTS } from '@packs/nh/recordSeries'
import { RecordSeriesSchema } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'
import { computeRetention } from '@/features/records/computeRetention'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate
const seriesOf = (key: string) => {
  const found = NH_RECORD_SERIES.find((s) => s.key === key)
  if (found === undefined) throw new Error(`no series ${key}`)
  return found
}

const STATUTE_URL = 'https://gc.nh.gov/rsa/html/III/33-A/33-A-3-a.htm'

describe('NH record series', () => {
  it('every series cites RSA 33-A:3-a with a roman numeral and the statute url', () => {
    for (const series of NH_RECORD_SERIES) {
      expect(RecordSeriesSchema.safeParse(series).success).toBe(true)
      expect(series.citation.label.startsWith('RSA 33-A:3-a')).toBe(true)
      expect(series.citation.label.slice('RSA 33-A:3-a'.length).trim()).toMatch(/^[IVXLC]*$/)
      expect(series.citation.url).toBe(STATUTE_URL)
    }
  })

  it('every outcome target exists', () => {
    const keys = new Set(NH_RECORD_SERIES.map((s) => s.key))
    for (const series of NH_RECORD_SERIES) {
      for (const target of Object.values(series.outcomes ?? {})) expect(keys.has(target)).toBe(true)
    }
    for (const key of Object.values(RECORD_SERIES_DEFAULTS.byClassification)) {
      expect(keys.has(key)).toBe(true)
    }
  })

  it('series keys are unique', () => {
    const keys = NH_RECORD_SERIES.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('driveway series is permanent per XXXIV', () => {
    const series = seriesOf('nh.rs.driveway_permits')
    expect(series.retention).toEqual({ kind: 'permanent' })
    expect(series.citation.label).toBe('RSA 33-A:3-a XXXIV')
  })

  it('registration expired 2028-04-30 is eligible 2029-04-30', () => {
    const series = seriesOf('nh.rs.licenses_other')
    const status = computeRetention(series, {
      recordDate: d('2027-05-01'),
      events: [{ kind: 'registration_expired', occurredOn: d('2028-04-30') }],
    })
    expect(status).toEqual({ state: 'eligible_on', date: '2029-04-30' })
  })

  it('complaint log waits for appeal_period_expired', () => {
    const series = seriesOf('nh.rs.complaint_log')
    expect(computeRetention(series, { recordDate: d('2027-05-01'), events: [] })).toEqual({
      state: 'not_yet_triggered',
      awaiting: ['appeal_period_expired'],
    })
  })

  it('unscheduled permits are kept permanently pending review', () => {
    const series = seriesOf('nh.rs.unscheduled_permanent')
    expect(series.label).toBe('No schedule entry: kept permanently pending review')
    expect(series.retention).toEqual({ kind: 'permanent' })
  })

  it('application types without a classification default are keyed by type', () => {
    const byType = RECORD_SERIES_DEFAULTS.byApplicationType
    expect(byType.DW).toBe('nh.rs.driveway_permits')
    expect(byType.AR).toBe('nh.rs.licenses_other')
    expect(byType.STR).toBe('nh.rs.licenses_other')
    expect(byType.SC).toBe('nh.rs.septic_plans')
    for (const key of ['SG', 'HO', 'SA', 'CO', 'TS']) {
      expect(byType[key]).toBe('nh.rs.unscheduled_permanent')
    }
  })
})
