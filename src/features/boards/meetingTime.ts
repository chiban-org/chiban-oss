import { inputField, trimmed } from '@/features/input/field'
import { err, ok } from '@/types/result'

export const DEFAULT_MEETING_START_MINUTE = 1140

const TWO_DIGITS = /^\d{2}$/
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60

export function meetingStartTime(noun: string) {
  return inputField((raw) => {
    const value = trimmed(raw)
    if (value === '') return ok(DEFAULT_MEETING_START_MINUTE)
    const parts = value.split(':')
    const wellFormed =
      (parts.length === 2 || parts.length === 3) && parts.every((p) => TWO_DIGITS.test(p))
    const hours = wellFormed ? Number(parts[0]) : Number.NaN
    const minutes = wellFormed ? Number(parts[1]) : Number.NaN
    if (!(hours < HOURS_PER_DAY && minutes < MINUTES_PER_HOUR))
      return err(`Enter ${noun} as a time of day, like 7:00 PM.`)
    return ok(hours * MINUTES_PER_HOUR + minutes)
  })
}

export function minuteToTimeInput(minute: number): string {
  const hours = String(Math.floor(minute / MINUTES_PER_HOUR)).padStart(2, '0')
  const minutes = String(minute % MINUTES_PER_HOUR).padStart(2, '0')
  return `${hours}:${minutes}`
}
