import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'
import { minutesToClock } from '@/features/inspections/zonedTime'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function describeDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  const first = sorted[0]
  const last = sorted.at(-1)
  if (first === undefined || last === undefined) return 'No days'
  const consecutive = sorted.every((d, i) => i === 0 || d === (sorted[i - 1] ?? 0) + 1)
  if (sorted.length === 5 && first === 1 && last === 5) return 'Weekdays'
  if (consecutive && sorted.length > 1) return `${DAY_NAMES[first]} to ${DAY_NAMES[last]}`
  return sorted.map((d) => DAY_NAMES[d]).join(', ')
}

export function describePhoneHours(settings: InspectionSettingsBody): string {
  const hours = settings.phoneRequestHours
  return `${describeDays(hours.days)}, ${minutesToClock(hours.startMinute)} to ${minutesToClock(hours.endMinute)}`
}

export function describeInspectionDays(settings: InspectionSettingsBody): string {
  return describeDays(settings.schedulingDays)
}
