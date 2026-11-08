import { describe, expect, it } from 'vitest'
import {
  firstRunOnOrAfter,
  nextRunAfterSend,
  periodBefore,
  periodLabel,
} from '@/features/reports/schedulePeriod'
import type { CivilDate } from '@/types/civilDate'

const d = (s: string) => s as CivilDate

describe('firstRunOnOrAfter', () => {
  it('weekly schedules run on Mondays, including today when today is a Monday', () => {
    expect(firstRunOnOrAfter('weekly', d('2026-11-09'))).toBe('2026-11-09')
    expect(firstRunOnOrAfter('weekly', d('2026-11-08'))).toBe('2026-11-09')
    expect(firstRunOnOrAfter('weekly', d('2026-11-10'))).toBe('2026-11-16')
  })

  it('monthly schedules run on the first of the month', () => {
    expect(firstRunOnOrAfter('monthly', d('2026-11-01'))).toBe('2026-11-01')
    expect(firstRunOnOrAfter('monthly', d('2026-11-08'))).toBe('2026-12-01')
    expect(firstRunOnOrAfter('monthly', d('2026-12-31'))).toBe('2027-01-01')
  })

  it('quarterly schedules run on January, April, July and October 1', () => {
    expect(firstRunOnOrAfter('quarterly', d('2026-10-01'))).toBe('2026-10-01')
    expect(firstRunOnOrAfter('quarterly', d('2026-11-08'))).toBe('2027-01-01')
    expect(firstRunOnOrAfter('quarterly', d('2027-02-28'))).toBe('2027-04-01')
    expect(firstRunOnOrAfter('quarterly', d('2027-06-30'))).toBe('2027-07-01')
  })
})

describe('nextRunAfterSend', () => {
  it('moves past today even when today is itself a run day', () => {
    expect(nextRunAfterSend('weekly', d('2026-11-09'))).toBe('2026-11-16')
    expect(nextRunAfterSend('monthly', d('2026-11-01'))).toBe('2026-12-01')
    expect(nextRunAfterSend('quarterly', d('2026-10-01'))).toBe('2027-01-01')
  })

  it('skips missed runs after downtime instead of sending each one late', () => {
    expect(nextRunAfterSend('monthly', d('2027-03-15'))).toBe('2027-04-01')
  })
})

describe('periodBefore', () => {
  it('a weekly run covers the previous Monday through Sunday', () => {
    expect(periodBefore('weekly', d('2026-11-09'))).toEqual({
      from: '2026-11-02',
      to: '2026-11-08',
    })
  })

  it('a monthly run covers the whole previous month, across a year end', () => {
    expect(periodBefore('monthly', d('2027-01-01'))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    })
    expect(periodBefore('monthly', d('2028-03-01'))).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    })
  })

  it('a quarterly run covers the previous calendar quarter', () => {
    expect(periodBefore('quarterly', d('2027-01-01'))).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    })
    expect(periodBefore('quarterly', d('2027-07-01'))).toEqual({
      from: '2027-04-01',
      to: '2027-06-30',
    })
  })

  it('a run delayed past its day still covers the period before its scheduled day', () => {
    expect(periodBefore('monthly', d('2026-11-03'))).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    })
  })
})

describe('periodLabel', () => {
  it('names a month, a quarter and a week in words', () => {
    expect(periodLabel('monthly', { from: d('2026-10-01'), to: d('2026-10-31') })).toBe(
      'October 2026',
    )
    expect(periodLabel('quarterly', { from: d('2026-10-01'), to: d('2026-12-31') })).toBe(
      'October to December 2026',
    )
    expect(periodLabel('weekly', { from: d('2026-11-02'), to: d('2026-11-08') })).toBe(
      'Week of November 2, 2026',
    )
  })
})
