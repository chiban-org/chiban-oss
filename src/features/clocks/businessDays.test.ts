import { nhLegalHolidays } from '@packs/nh/holidays'
import { describe, expect, it } from 'vitest'
import { computeDue } from '@/features/clocks/computeDue'
import { describeCounting } from '@/features/clocks/describeCounting'
import { makeHolidayCalendar } from '@/features/clocks/holidayCalendar'
import type { CivilDate } from '@/types/civilDate'

const holidays = makeHolidayCalendar((y) => nhLegalHolidays(y))
const d = (s: string) => s as CivilDate
const citations = { dayCounting: 'RSA 21:35 I', businessDayRoll: 'RSA 21:35 II' }

function businessDays(start: string, value: number) {
  return computeDue({
    start: d(start),
    length: { unit: 'business_days', value },
    direction: 'after',
    clockType: 'action_due',
    holidays,
  })
}

describe('business-day counting', () => {
  it('five business days from 2027-07-01 is 2027-07-09', () => {
    expect(businessDays('2027-07-01', 5)).toEqual({ due: '2027-07-09', rolledFrom: null })
  })

  it('five business days from 2027-03-10 is 2027-03-17', () => {
    expect(businessDays('2027-03-10', 5).due).toBe('2027-03-17')
  })

  it('business-day due never rolls', () => {
    const result = businessDays('2027-03-12', 5)
    expect(result).toEqual({ due: '2027-03-19', rolledFrom: null })
  })

  it('counts from a weekend start without counting the start day', () => {
    expect(businessDays('2027-03-13', 1).due).toBe('2027-03-15')
  })

  it('explains the count in business days', () => {
    const input = {
      start: d('2027-07-01'),
      length: { unit: 'business_days' as const, value: 5 },
      direction: 'after' as const,
      clockType: 'action_due' as const,
      holidays,
    }
    const text = describeCounting(input, computeDue(input), citations)
    expect(text).toContain('5 business days after 2027-07-01')
    expect(text).toContain('Saturdays, Sundays, and legal holidays')
  })
})

describe('thirty-day filing windows', () => {
  const window = (start: string, value = 30) =>
    computeDue({
      start: d(start),
      length: { unit: 'days', value },
      direction: 'after',
      clockType: 'filing_window',
      holidays,
    })

  it('rehearing due 2027-05-15 rolls to 2027-05-17', () => {
    expect(window('2027-04-15')).toEqual({ due: '2027-05-17', rolledFrom: '2027-05-15' })
  })

  it('court after rehearing denial 2027-05-20 is 2027-06-21', () => {
    expect(window('2027-05-20').due).toBe('2027-06-21')
  })

  it('planning board court window from 2027-06-09 is 2027-07-09', () => {
    expect(window('2027-06-09').due).toBe('2027-07-09')
  })

  it('administrative appeal from 2027-03-01 is due 2027-03-31', () => {
    expect(window('2027-03-01').due).toBe('2027-03-31')
  })
})
