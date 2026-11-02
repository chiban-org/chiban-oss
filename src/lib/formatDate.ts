import type { CivilDate } from '@/types/civilDate'

const NARROW_NO_BREAK_SPACE = / /g

export function formatCivilDate(date: CivilDate | string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function formatInstant(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(instant)
    .replace(NARROW_NO_BREAK_SPACE, ' ')
}

export function formatInstantDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(instant)
}
