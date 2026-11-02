import { nhLegalHolidays } from '@packs/nh/holidays'
import { describe, expect, it } from 'vitest'
import { computeDue } from '@/features/clocks/computeDue'
import { describeCounting } from '@/features/clocks/describeCounting'
import { makeHolidayCalendar } from '@/features/clocks/holidayCalendar'
import type { CivilDate } from '@/types/civilDate'

const holidays = makeHolidayCalendar((y) => nhLegalHolidays(y))
const d = (s: string) => s as CivilDate
const days = (value: number) => ({ unit: 'days' as const, value })
const citations = { dayCounting: 'RSA 21:35 I', businessDayRoll: 'RSA 21:35 II' }

function action(start: string, length: number) {
  return computeDue({
    start: d(start),
    length: days(length),
    direction: 'after',
    clockType: 'action_due',
    holidays,
  })
}

describe('computeDue', () => {
  it('action due 30 days from 2027-03-01 is 2027-03-31', () => {
    expect(action('2027-03-01', 30).due).toBe('2027-03-31')
  })

  it('action due 60 days from 2027-03-01 is 2027-04-30', () => {
    expect(action('2027-03-01', 60).due).toBe('2027-04-30')
  })

  it('action deadline never rolls', () => {
    expect(action('2027-03-04', 30)).toEqual({ due: '2027-04-03', rolledFrom: null })
  })

  it('filing roll skips Saturday', () => {
    const r = computeDue({
      start: d('2027-03-04'),
      length: days(30),
      direction: 'after',
      clockType: 'filing_window',
      holidays,
    })
    expect(r).toEqual({ due: '2027-04-05', rolledFrom: '2027-04-03' })
  })

  it('filing roll skips Sunday then observed Monday', () => {
    const r = computeDue({
      start: d('2027-06-04'),
      length: days(30),
      direction: 'after',
      clockType: 'filing_window',
      holidays,
    })
    expect(r).toEqual({ due: '2027-07-06', rolledFrom: '2027-07-04' })
  })

  it('filing roll over Saturday Christmas lands Monday', () => {
    const r = computeDue({
      start: d('2027-11-25'),
      length: days(30),
      direction: 'after',
      clockType: 'filing_window',
      holidays,
    })
    expect(r.due).toBe('2027-12-27')
  })

  it('filing roll over election day', () => {
    const r = computeDue({
      start: d('2026-10-04'),
      length: days(30),
      direction: 'after',
      clockType: 'filing_window',
      holidays,
    })
    expect(r).toEqual({ due: '2026-11-04', rolledFrom: '2026-11-03' })
  })

  it('exercise by one year', () => {
    const r = computeDue({
      start: d('2027-03-15'),
      length: { unit: 'months', value: 12 },
      direction: 'after',
      clockType: 'exercise_by',
      holidays,
    })
    expect(r.due).toBe('2028-03-15')
  })

  it('notice lead 10 days before 2027-05-20 is 2027-05-10', () => {
    const r = computeDue({
      start: d('2027-05-20'),
      length: days(10),
      direction: 'before',
      clockType: 'notice_lead',
      holidays,
    })
    expect(r.due).toBe('2027-05-10')
  })
})

describe('describeCounting', () => {
  it('description of a filing window mentions next business day', () => {
    const input = {
      start: d('2027-03-04'),
      length: days(30),
      direction: 'after' as const,
      clockType: 'filing_window' as const,
      holidays,
    }
    const text = describeCounting(input, computeDue(input), citations)
    expect(text).toContain('30 calendar days after 2027-03-04')
    expect(text).toContain('RSA 21:35 I')
    expect(text).toContain('next business day (RSA 21:35 II)')
  })

  it('description of an action deadline says it does not move', () => {
    const input = {
      start: d('2027-03-04'),
      length: days(30),
      direction: 'after' as const,
      clockType: 'action_due' as const,
      holidays,
    }
    expect(describeCounting(input, computeDue(input), citations)).toContain(
      'Does not move for weekends or holidays.',
    )
  })
})
