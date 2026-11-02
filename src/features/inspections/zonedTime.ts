import type { CivilDate } from '@/types/civilDate'

interface Wall {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function wallAt(instantMs: number, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instantMs))
  const pick = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? Number.NaN)
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  }
}

function asUtcMs(w: Wall): number {
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
}

function offsetMs(instantMs: number, timeZone: string): number {
  const truncated = instantMs - (((instantMs % 1000) + 1000) % 1000)
  return asUtcMs(wallAt(truncated, timeZone)) - truncated
}

function civilParts(date: CivilDate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 }
}

export function localToUtc(date: CivilDate, minute: number, timeZone: string): Date {
  const { year, month, day } = civilParts(date)
  const guess = Date.UTC(year, month - 1, day, 0, minute)
  const first = guess - offsetMs(guess, timeZone)
  const secondOffset = offsetMs(first, timeZone)
  if (secondOffset === guess - first) return new Date(first)
  const second = guess - secondOffset
  return new Date(asUtcMs(wallAt(second, timeZone)) === guess ? second : first)
}

export function utcToLocal(instant: Date, timeZone: string): { date: CivilDate; minute: number } {
  const w = wallAt(instant.getTime(), timeZone)
  const date = `${String(w.year).padStart(4, '0')}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`
  return { date: date as CivilDate, minute: w.hour * 60 + w.minute }
}

export function minutesToClock(minute: number): string {
  const h = Math.floor(minute / 60)
  const m = minute % 60
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
}
