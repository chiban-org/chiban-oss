import { AppError, ErrorIds } from '@/constants/errorIds'

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

function dividesEvenly(whole: number, part: number): boolean {
  return Number.isInteger(part) && part >= 1 && part <= whole && whole % part === 0
}

function minuteCron(minutes: number): string {
  if (minutes === 1) return '* * * * *'
  if (minutes === MINUTES_PER_HOUR) return '0 * * * *'
  return `*/${minutes} * * * *`
}

export function cronForInterval(intervalSeconds: number): string {
  const minutes = intervalSeconds / SECONDS_PER_MINUTE
  if (dividesEvenly(MINUTES_PER_HOUR, minutes)) return minuteCron(minutes)
  const hours = minutes / MINUTES_PER_HOUR
  if (hours > 1 && dividesEvenly(HOURS_PER_DAY, hours)) return `0 */${hours} * * *`
  throw new AppError(ErrorIds.JOB_UNKNOWN, 'interval cannot be expressed as a cron schedule', {
    intervalSeconds,
  })
}
