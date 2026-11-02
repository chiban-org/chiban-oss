import { describe, expect, it } from 'vitest'
import { makeHolidayCalendar } from '@/features/clocks/holidayCalendar'
import {
  addDays,
  addMonthsClamped,
  type CivilDate,
  compareCivil,
  dayOfWeek,
  daysBetween,
} from '@/types/civilDate'

const d = (s: string) => s as CivilDate

describe('civil date arithmetic', () => {
  it('clamps the day to the target month', () => {
    expect(addMonthsClamped(d('2027-01-31'), 1)).toBe('2027-02-28')
    expect(addMonthsClamped(d('2028-02-29'), 12)).toBe('2029-02-28')
  })

  it('subtracts months across a year boundary', () => {
    expect(addMonthsClamped(d('2027-02-15'), -3)).toBe('2026-11-15')
  })

  it('counts days between dates', () => {
    expect(daysBetween(d('2027-05-01'), d('2027-06-10'))).toBe(40)
  })

  it('adds and subtracts days across month ends', () => {
    expect(addDays(d('2027-03-01'), 30)).toBe('2027-03-31')
    expect(addDays(d('2027-03-01'), -1)).toBe('2027-02-28')
  })

  it('reads the weekday with Sunday as zero', () => {
    expect(dayOfWeek(d('2027-07-04'))).toBe(0)
    expect(dayOfWeek(d('2027-04-03'))).toBe(6)
  })

  it('compares dates', () => {
    expect(compareCivil(d('2027-01-01'), d('2027-01-02'))).toBe(-1)
    expect(compareCivil(d('2027-01-02'), d('2027-01-02'))).toBe(0)
    expect(compareCivil(d('2027-01-03'), d('2027-01-02'))).toBe(1)
  })
})

describe('holiday calendar', () => {
  it('memoizes the source per year and answers by date', () => {
    let calls = 0
    const cal = makeHolidayCalendar((year) => {
      calls += 1
      return [{ date: d(`${year}-07-04`), name: 'Independence Day' }]
    })
    expect(cal.isHoliday(d('2027-07-04'))).toBe(true)
    expect(cal.holidayName(d('2027-07-04'))).toBe('Independence Day')
    expect(cal.isHoliday(d('2027-07-05'))).toBe(false)
    expect(cal.holidayName(d('2027-07-05'))).toBeNull()
    expect(calls).toBe(1)
  })
})
