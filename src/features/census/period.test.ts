import { describe, expect, it } from 'vitest'
import { censusPeriod } from '@/features/census/period'
import type { CivilDate } from '@/types/civilDate'

const today = '2026-11-06' as CivilDate

describe('censusPeriod', () => {
  it('reads a year and month from the query', () => {
    expect(censusPeriod('2027', '3', today)).toEqual({ year: 2027, month: 3 })
    expect(censusPeriod('2027', 'year', today)).toEqual({ year: 2027, month: null })
  })

  it('falls back to the town today when the year or month is missing', () => {
    expect(censusPeriod(undefined, undefined, today)).toEqual({ year: 2026, month: 11 })
    expect(censusPeriod(null, null, today)).toEqual({ year: 2026, month: 11 })
  })

  it('falls back to the town year for year 0, -5, 1899, 2100 and words instead of querying them', () => {
    for (const year of ['0', '-5', '1899', '2100', 'abc', '2027.5'])
      expect([year, censusPeriod(year, '3', today)]).toEqual([year, { year: 2026, month: 3 }])
  })

  it('falls back to the town month for month 0, 13 and words', () => {
    for (const month of ['0', '13', 'march'])
      expect([month, censusPeriod('2027', month, today)]).toEqual([
        month,
        { year: 2027, month: 11 },
      ])
  })
})
