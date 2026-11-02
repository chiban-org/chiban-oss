import { NH_INSPECTION_SETTINGS_DEFAULT } from '@packs/nh/starters'
import { describe, expect, it } from 'vitest'
import { describeInspectionDays, describePhoneHours } from '@/features/inspections/phoneHours'

describe('phone hours text', () => {
  it('names Alder Pond weekday hours', () => {
    expect(describePhoneHours(NH_INSPECTION_SETTINGS_DEFAULT)).toBe('Weekdays, 8:00 AM to 12:00 PM')
  })

  it('lists non-consecutive inspection days', () => {
    expect(describeInspectionDays(NH_INSPECTION_SETTINGS_DEFAULT)).toBe('Monday, Wednesday, Friday')
  })

  it('names a consecutive range', () => {
    const settings = {
      ...NH_INSPECTION_SETTINGS_DEFAULT,
      phoneRequestHours: { days: [2, 3, 4] as (2 | 3 | 4)[], startMinute: 540, endMinute: 780 },
    }
    expect(describePhoneHours(settings)).toBe('Tuesday to Thursday, 9:00 AM to 1:00 PM')
  })
})
