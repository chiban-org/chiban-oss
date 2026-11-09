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

export function formatCivilDateWithWeekday(date: CivilDate | string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function formatWeekdayMonthDay(date: CivilDate | string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function formatCivilDateShort(date: CivilDate | string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`))
}

const ISO_DATE_IN_TEXT = /\b\d{4}-\d{2}-\d{2}\b/g

export function humanizeIsoDates(text: string): string {
  return text.replace(ISO_DATE_IN_TEXT, (iso) =>
    Number.isNaN(new Date(`${iso}T00:00:00Z`).getTime()) ? iso : formatCivilDate(iso),
  )
}

export function formatInstant(instant: Date, timeZone: string): string {
  return formatInstantLong(instant, timeZone)
}

export function formatInstantLong(instant: Date, timeZone: string): string {
  return `${formatInstantDate(instant, timeZone)}, ${new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(instant)
    .replace(NARROW_NO_BREAK_SPACE, ' ')}`
}

export function formatInstantOrNever(instant: Date | null, timeZone: string): string {
  return instant === null ? 'Never' : formatInstantLong(instant, timeZone)
}

export function formatInstantDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(instant)
}
