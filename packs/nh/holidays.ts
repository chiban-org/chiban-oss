import { addDays, type CivilDate, dayOfWeek } from '@/types/civilDate'

export const NH_ELECTION_DATE_CITATION = 'RSA 653:7'

export interface NhHoliday {
  date: CivilDate
  name: string
  citation: 'RSA 288:1' | 'RSA 288:2'
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

const MONDAY = 1
const THURSDAY = 4

export function nhLegalHolidays(
  year: number,
  opts: { thanksgiving?: Record<number, CivilDate> } = {},
): NhHoliday[] {
  const base: { date: CivilDate; name: string }[] = [
    { date: civil(year, 1, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 1, MONDAY, 3), name: 'Martin Luther King, Jr. Civil Rights Day' },
    { date: nthWeekday(year, 2, MONDAY, 3), name: "Washington's Birthday" },
    { date: lastWeekday(year, 5, MONDAY), name: 'Memorial Day' },
    { date: civil(year, 7, 4), name: 'Independence Day' },
    { date: nthWeekday(year, 9, MONDAY, 1), name: 'Labor Day' },
    { date: nthWeekday(year, 10, MONDAY, 2), name: 'Columbus Day' },
    { date: civil(year, 11, 11), name: 'Veterans Day' },
    {
      date: opts.thanksgiving?.[year] ?? nthWeekday(year, 11, THURSDAY, 4),
      name: 'Thanksgiving Day',
    },
    { date: civil(year, 12, 25), name: 'Christmas Day' },
  ]
  if (year % 2 === 0) {
    base.push({
      date: addDays(nthWeekday(year, 11, MONDAY, 1), 1),
      name: 'Biennial election day',
    })
  }
  const holidays: NhHoliday[] = base.map((h) => ({ ...h, citation: 'RSA 288:1' }))
  for (const h of base) {
    if (dayOfWeek(h.date) === 0) {
      holidays.push({
        date: addDays(h.date, 1),
        name: `${h.name} (observed)`,
        citation: 'RSA 288:2',
      })
    }
  }
  return holidays
}
