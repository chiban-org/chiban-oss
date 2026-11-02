import { err, ok, type Result } from '@/types/result'

export type CivilDate = string & { readonly __civil: true }

const CIVIL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseCivilDate(s: string): Result<CivilDate, 'invalid_date'> {
  const m = CIVIL_PATTERN.exec(s)
  if (m === null) return err('invalid_date')
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(year, month - 1, day))
  const same =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  return same ? ok(s as CivilDate) : err('invalid_date')
}

export function todayInTimeZone(tz: string, now: Date): CivilDate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now) as CivilDate
}

export function civilYear(d: CivilDate): number {
  return Number(d.slice(0, 4))
}

const MS_PER_DAY = 86_400_000

export function daysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY)
}
