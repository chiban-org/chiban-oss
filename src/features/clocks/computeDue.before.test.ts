import { nhLegalHolidays } from '@packs/nh/holidays'
import { describe, expect, it } from 'vitest'
import { type ClockType, computeDue } from '@/features/clocks/computeDue'
import { makeHolidayCalendar } from '@/features/clocks/holidayCalendar'
import type { CivilDate } from '@/types/civilDate'

const holidays = makeHolidayCalendar((y) => nhLegalHolidays(y))
const CLOCK_TYPES: ClockType[] = ['action_due', 'filing_window', 'notice_lead', 'exercise_by']

describe('computeDue before', () => {
  it.each(
    CLOCK_TYPES,
  )('a before-direction %s deadline on a Saturday does not move', (clockType) => {
    const result = computeDue({
      start: '2027-06-26' as CivilDate,
      length: { unit: 'days', value: 21 },
      direction: 'before',
      clockType,
      holidays,
    })
    expect(result).toEqual({ due: '2027-06-05', rolledFrom: null })
  })

  it('a before-direction deadline on a legal holiday does not move', () => {
    const result = computeDue({
      start: '2027-07-14' as CivilDate,
      length: { unit: 'days', value: 10 },
      direction: 'before',
      clockType: 'filing_window',
      holidays,
    })
    expect(result).toEqual({ due: '2027-07-04', rolledFrom: null })
  })
})
