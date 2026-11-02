import { NH_RECORD_SERIES, RECORD_SERIES_DEFAULTS } from '@packs/nh/recordSeries'
import { RecordSeriesSchema } from '@packs/nh/schema'
import { describe, expect, it } from 'vitest'

const STATUTE_URL = 'https://gc.nh.gov/rsa/html/III/33-A/33-A-3-a.htm'

describe('NH record series', () => {
  it('every series cites RSA 33-A:3-a with a roman numeral and the statute url', () => {
    for (const series of NH_RECORD_SERIES) {
      expect(RecordSeriesSchema.safeParse(series).success).toBe(true)
      expect(series.citation.label).toMatch(/^RSA 33-A:3-a [IVXL]+$/)
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
})
