import { addDays, type CivilDate, dayOfWeek } from '@/types/civilDate'

export const ME_HOLIDAY_CITATION = '4 MRSA §1051'
export const ME_THANKSGIVING_NAME = 'Thanksgiving (fourth Thursday, Chiban assumption)'

export interface MeHoliday {
  date: CivilDate
  name: string
  citation: typeof ME_HOLIDAY_CITATION
}

function civil(year: number, month: number, day: number): CivilDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as CivilDate
}

function nthWeekday(year: number, month: number, weekday: number, n: number): CivilDate {
  const first = civil(year, month, 1)
  const offset = (weekday - dayOfWeek(first) + 7) % 7
  return addDays(first, offset + (n - 1) * 7)
}

function lastWeekday(year: number, month: number, weekday: number): CivilDate {
  const firstOfNext = month === 12 ? civil(year + 1, 1, 1) : civil(year, month + 1, 1)
  const end = addDays(firstOfNext, -1)
  return addDays(end, -((dayOfWeek(end) - weekday + 7) % 7))
}

const SUNDAY = 0
const MONDAY = 1
const THURSDAY = 4

export function meLegalHolidays(
  year: number,
  opts: { thanksgiving?: ReadonlyMap<number, CivilDate> } = {},
): MeHoliday[] {
  const base: { date: CivilDate; name: string }[] = [
    { date: civil(year, 1, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 1, MONDAY, 3), name: 'Martin Luther King, Jr., Day' },
    { date: nthWeekday(year, 2, MONDAY, 3), name: "Washington's Birthday" },
    { date: nthWeekday(year, 4, MONDAY, 3), name: "Patriot's Day" },
    { date: lastWeekday(year, 5, MONDAY), name: 'Memorial Day' },
    { date: civil(year, 6, 19), name: 'Juneteenth' },
    { date: civil(year, 7, 4), name: 'Independence Day' },
    { date: nthWeekday(year, 9, MONDAY, 1), name: 'Labor Day' },
    { date: nthWeekday(year, 10, MONDAY, 2), name: 'Indigenous Peoples Day' },
    { date: civil(year, 11, 11), name: 'Veterans Day' },
    {
      date: opts.thanksgiving?.get(year) ?? nthWeekday(year, 11, THURSDAY, 4),
      name: ME_THANKSGIVING_NAME,
    },
    { date: civil(year, 12, 25), name: 'Christmas Day' },
  ]
  const observed = base
    .filter((h) => dayOfWeek(h.date) === SUNDAY)
    .map((h) => ({ date: addDays(h.date, 1), name: `${h.name} (observed)` }))
  return [...base, ...observed].map((h) => ({ ...h, citation: ME_HOLIDAY_CITATION }))
}
