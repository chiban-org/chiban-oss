import { formatCivilDate } from '@/lib/formatDate'
import { addDays, type CivilDate, dayOfWeek } from '@/types/civilDate'

export interface WeekDay {
  date: string
  freeStarts: number[]
}

export interface SlotWeek<D extends WeekDay> {
  start: CivilDate
  label: string
  days: D[]
  open: number
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' })

export function weekdayName(date: string): string {
  return WEEKDAY.format(new Date(`${date}T00:00:00Z`))
}

export function weekStart(date: CivilDate): CivilDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7))
}

function weekLabel(start: CivilDate, today: CivilDate): string {
  const current = weekStart(today)
  if (start === current) return 'This week'
  if (start === addDays(current, 7)) return 'Next week'
  return `Week of ${formatCivilDate(start)}`
}

export function groupSlotWeeks<D extends WeekDay>(days: D[], today: CivilDate): SlotWeek<D>[] {
  const weeks = new Map<CivilDate, D[]>()
  for (const day of days) {
    const start = weekStart(day.date as CivilDate)
    weeks.set(start, [...(weeks.get(start) ?? []), day])
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([start, list]) => ({
      start,
      label: weekLabel(start, today),
      days: list,
      open: list.reduce((sum, d) => sum + d.freeStarts.length, 0),
    }))
}

export function firstOpenWeek<D extends WeekDay>(weeks: SlotWeek<D>[]): CivilDate | null {
  return (weeks.find((w) => w.open > 0) ?? weeks[0])?.start ?? null
}

export function openCountText(open: number): string {
  return open === 0 ? 'Full' : `${open} open`
}
