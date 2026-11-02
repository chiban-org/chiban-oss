import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const MAX_REPORT_DAYS = 1827

export interface ReportRange {
  from: CivilDate
  to: CivilDate
}

export type RangeError = 'range_too_long' | 'invalid_range'

export function checkRange(range: ReportRange): Result<ReportRange, RangeError> {
  const span = daysBetween(range.from, range.to)
  if (span < 0) return err('invalid_range')
  if (span + 1 > MAX_REPORT_DAYS) return err('range_too_long')
  return ok(range)
}
