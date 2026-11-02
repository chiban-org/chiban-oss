import { nhLegalHolidays } from '@packs/nh/holidays'
import { NH_INSPECTION_SETTINGS_DEFAULT as ALDER_POND_INSPECTION_SETTINGS } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { makeHolidayCalendar } from '@/features/clocks/holidayCalendar'
import { InspectionSettingsBodySchema } from '@/features/inspections/settingsSchema'
import { isPhoneRequestTime, schedulingDates, slotStarts } from '@/features/inspections/slots'
import type { CivilDate } from '@/types/civilDate'

const holidays = makeHolidayCalendar((year) => nhLegalHolidays(year))
const d = (s: string) => s as CivilDate

describe('inspection slots', () => {
  it('scheduling dates from Thursday 2027-07-01 skip the July 5 observed holiday', () => {
    const settings = {
      ...ALDER_POND_INSPECTION_SETTINGS,
      schedulingDays: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5)[],
    }
    const dates = schedulingDates(settings, holidays, d('2027-07-01'))
    expect(dates.slice(0, 2)).toEqual(['2027-07-02', '2027-07-06'])
    expect(dates).not.toContain('2027-07-05')
  })

  it('scheduling dates use Monday, Wednesday, and Friday for Alder Pond', () => {
    const dates = schedulingDates(ALDER_POND_INSPECTION_SETTINGS, holidays, d('2027-07-01'))
    expect(dates.slice(0, 3)).toEqual(['2027-07-02', '2027-07-07', '2027-07-09'])
  })

  it('slot starts for 570 to 930 by 60 are six starts', () => {
    expect(slotStarts(ALDER_POND_INSPECTION_SETTINGS)).toEqual([570, 630, 690, 750, 810, 870])
  })

  it('window not divisible by slot length fails the schema', () => {
    const parsed = InspectionSettingsBodySchema.safeParse({
      ...ALDER_POND_INSPECTION_SETTINGS,
      slotMinutes: 50,
    })
    expect(parsed.success).toBe(false)
  })

  it('window start after end fails the schema', () => {
    const parsed = InspectionSettingsBodySchema.safeParse({
      ...ALDER_POND_INSPECTION_SETTINGS,
      windowStartMinute: 930,
      windowEndMinute: 570,
    })
    expect(parsed.success).toBe(false)
  })

  it('phone request time is true at Tuesday 08:00 and false at 12:00', () => {
    const s = ALDER_POND_INSPECTION_SETTINGS
    expect(isPhoneRequestTime(s, holidays, { date: d('2027-07-06'), minute: 480 })).toBe(true)
    expect(isPhoneRequestTime(s, holidays, { date: d('2027-07-06'), minute: 720 })).toBe(false)
  })

  it('phone request time is false on a legal holiday', () => {
    const s = ALDER_POND_INSPECTION_SETTINGS
    expect(isPhoneRequestTime(s, holidays, { date: d('2027-07-05'), minute: 540 })).toBe(false)
  })
})
