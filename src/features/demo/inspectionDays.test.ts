import { describe, expect, it } from 'vitest'
import { pickInspectionDays } from '@/features/demo/inspectionDays'
import { type CivilDate, dayOfWeek } from '@/types/civilDate'

const WEEKDAYS = [1, 2, 3, 4, 5]
const isWeekday = (date: CivilDate) => WEEKDAYS.includes(dayOfWeek(date))

describe('pickInspectionDays', () => {
  it('keeps today when today is an inspection day', () => {
    expect(pickInspectionDays(isWeekday, '2026-11-05' as CivilDate)).toEqual({
      seeded: '2026-11-05',
      recent: '2026-11-04',
      earlier: '2026-11-03',
      ahead: '2026-11-06',
    })
  })

  it('uses the Friday before on a Saturday so the seeded inspections are already due', () => {
    expect(pickInspectionDays(isWeekday, '2026-11-07' as CivilDate)).toEqual({
      seeded: '2026-11-06',
      recent: '2026-11-05',
      earlier: '2026-11-04',
      ahead: '2026-11-09',
    })
  })

  it('uses the Friday before on a Sunday', () => {
    expect(pickInspectionDays(isWeekday, '2026-11-08' as CivilDate).seeded).toBe('2026-11-06')
  })

  it('steps back over a day that is not an inspection day and never repeats a day', () => {
    const noWednesday = (date: CivilDate) => isWeekday(date) && dayOfWeek(date) !== 3
    const days = pickInspectionDays(noWednesday, '2026-11-04' as CivilDate)
    expect(days).toEqual({
      seeded: '2026-11-03',
      recent: '2026-11-02',
      earlier: '2026-10-30',
      ahead: '2026-11-05',
    })
  })

  it('books ahead on the next inspection day after today, never today itself', () => {
    const mondayWednesdayFriday = (date: CivilDate) => [1, 3, 5].includes(dayOfWeek(date))
    expect(pickInspectionDays(mondayWednesdayFriday, '2026-11-10' as CivilDate)).toMatchObject({
      seeded: '2026-11-09',
      ahead: '2026-11-11',
    })
    expect(pickInspectionDays(mondayWednesdayFriday, '2026-11-11' as CivilDate).ahead).toBe(
      '2026-11-13',
    )
  })
})
