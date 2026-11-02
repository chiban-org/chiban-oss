import type { CivilDate } from '@/types/civilDate'

export interface HolidayCalendar {
  isHoliday(d: CivilDate): boolean
  holidayName(d: CivilDate): string | null
}

export type HolidaySource = (year: number) => { date: CivilDate; name: string }[]

export function makeHolidayCalendar(source: HolidaySource): HolidayCalendar {
  const cache = new Map<number, Map<string, string>>()
  const forYear = (year: number): Map<string, string> => {
    const cached = cache.get(year)
    if (cached !== undefined) return cached
    const built = new Map(source(year).map((h) => [h.date as string, h.name]))
    cache.set(year, built)
    return built
  }
  const nameOf = (d: CivilDate): string | null => forYear(Number(d.slice(0, 4))).get(d) ?? null
  return {
    isHoliday: (d) => nameOf(d) !== null,
    holidayName: nameOf,
  }
}
