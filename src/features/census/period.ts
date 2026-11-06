import { EARLIEST_CIVIL_DATE, LATEST_CIVIL_DATE, wholeNumber } from '@/features/input/schemas'
import { type CivilDate, civilYear } from '@/types/civilDate'

const YEAR = wholeNumber('the year', {
  min: civilYear(EARLIEST_CIVIL_DATE),
  max: civilYear(LATEST_CIVIL_DATE),
})
const MONTH = wholeNumber('the month', { min: 1, max: 12 })

export interface CensusPeriod {
  year: number
  month: number | null
}

export function censusPeriod(
  yearParam: string | null | undefined,
  monthParam: string | null | undefined,
  today: CivilDate,
): CensusPeriod {
  const year = YEAR.safeParse(yearParam)
  const month = MONTH.safeParse(monthParam)
  return {
    year: year.success ? year.data : civilYear(today),
    month: monthParam === 'year' ? null : month.success ? month.data : Number(today.slice(5, 7)),
  }
}
