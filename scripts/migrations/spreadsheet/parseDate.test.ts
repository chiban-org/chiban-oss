import { describe, expect, it } from 'vitest'
import { parseHistoricalDate } from './parseDate'

const ALL = ['excel_serial', 'YYYY-MM-DD', 'MM/DD/YYYY', 'M/D/YY'] as const

describe('parseHistoricalDate', () => {
  it('excel serial 46388 is 2027-01-01', () => {
    expect(parseHistoricalDate(46388, [...ALL], 30)).toEqual({ ok: true, value: '2027-01-01' })
  })

  it('3/4/87 with pivot 30 is 1987-03-04', () => {
    expect(parseHistoricalDate('3/4/87', [...ALL], 30)).toEqual({ ok: true, value: '1987-03-04' })
  })

  it('1/2/05 with pivot 30 is 2005-01-02', () => {
    expect(parseHistoricalDate('1/2/05', [...ALL], 30)).toEqual({ ok: true, value: '2005-01-02' })
  })

  it('13/45/99 is unparseable', () => {
    expect(parseHistoricalDate('13/45/99', [...ALL], 30)).toEqual({
      ok: false,
      error: 'unparseable',
    })
  })

  it('reads a four digit year, an iso date, and a js date in utc', () => {
    expect(parseHistoricalDate('04/09/1999', [...ALL], 30)).toEqual({
      ok: true,
      value: '1999-04-09',
    })
    expect(parseHistoricalDate('2001-12-31', [...ALL], 30)).toEqual({
      ok: true,
      value: '2001-12-31',
    })
    expect(parseHistoricalDate(new Date('2003-02-01T00:00:00Z'), [...ALL], 30)).toEqual({
      ok: true,
      value: '2003-02-01',
    })
  })

  it('only accepts the formats the mapping lists', () => {
    expect(parseHistoricalDate('3/4/87', ['YYYY-MM-DD'], 30).ok).toBe(false)
    expect(parseHistoricalDate(46388, ['M/D/YY'], 30).ok).toBe(false)
  })

  it('a year equal to the pivot is read as 20yy', () => {
    expect(parseHistoricalDate('6/7/30', [...ALL], 30)).toEqual({ ok: true, value: '2030-06-07' })
    expect(parseHistoricalDate('6/7/31', [...ALL], 30)).toEqual({ ok: true, value: '1931-06-07' })
  })
})
