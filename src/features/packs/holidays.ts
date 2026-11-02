import { NH_COUNTING_CITATIONS } from '@packs/nh/countingCitations'
import { nhLegalHolidays } from '@packs/nh/holidays'
import { type HolidayCalendar, makeHolidayCalendar } from '@/features/clocks/holidayCalendar'

let cached: HolidayCalendar | null = null

export function packHolidayCalendar(): HolidayCalendar {
  cached ??= makeHolidayCalendar((year) => nhLegalHolidays(year))
  return cached
}

export const PACK_COUNTING_CITATIONS = NH_COUNTING_CITATIONS
