import {
  type BoardBooking,
  type BoardDay,
  type BoardInspector,
  type BoardItem,
  type BoardRequest,
  isBooking,
} from '@/components/inspections/boardTypes'
import {
  groupSlotWeeks,
  type SlotWeek,
  type WeekDay,
  weekdayName,
  weekStart,
} from '@/features/inspections/slotWeeks'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

const SHORT_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

export function shortDay(date: string): string {
  return SHORT_DAY.format(new Date(`${date}T00:00:00Z`))
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
})

export function weekTabLabel(week: SlotWeek<WeekDay>): string {
  if (!week.label.startsWith('Week of')) return week.label
  return `Week of ${MONTH_DAY.format(new Date(`${week.start}T00:00:00Z`))}`
}

export function upcoming(bookings: BoardBooking[], today: string): BoardBooking[] {
  return bookings.filter((b) => b.date >= today)
}

export function boardWeeks(
  days: BoardDay[],
  bookings: BoardBooking[],
  today: string,
): SlotWeek<WeekDay>[] {
  const stubs = upcoming(bookings, today).map((b) => ({ date: b.date, freeStarts: [] }))
  return groupSlotWeeks<WeekDay>([...days, ...stubs], today as CivilDate)
}

export function weekDates(week: SlotWeek<WeekDay> | undefined): string[] {
  return [...new Set(week?.days.map((d) => d.date) ?? [])].sort()
}

export function gridRows(inspectors: BoardInspector[], bookings: BoardBooking[]): BoardInspector[] {
  const rows = [...inspectors]
  for (const b of bookings) {
    if (!rows.some((r) => r.userId === b.inspectorUserId)) {
      rows.push({ userId: b.inspectorUserId, name: b.inspectorName })
    }
  }
  return rows
}

export function cellBookings(
  bookings: BoardBooking[],
  where: { date: string; inspectorUserId: string },
): BoardBooking[] {
  return bookings
    .filter((b) => b.date === where.date && b.inspectorUserId === where.inspectorUserId)
    .sort((a, b) => a.startMinute - b.startMinute)
}

export function openLabel(free: number, booked: number): string {
  if (free === 0) return 'Full'
  return booked > 0 ? `+${free} open` : `${free} open`
}

export function waitingItems(
  requests: BoardRequest[],
  bookings: BoardBooking[],
  today: string,
): BoardItem[] {
  return [...bookings.filter((b) => b.date < today), ...requests]
}

export function focusDate(item: BoardItem | undefined): string | null {
  if (item === undefined) return null
  if (item.preferredDate !== null) return item.preferredDate
  return isBooking(item) ? item.date : null
}

function shownWeekOf(date: string | null, weeks: SlotWeek<WeekDay>[]): CivilDate | null {
  if (date === null) return null
  const start = weekStart(date as CivilDate)
  return weeks.some((w) => w.start === start) ? start : null
}

export function focusWeek(
  item: BoardItem | undefined,
  weeks: SlotWeek<WeekDay>[],
): CivilDate | null {
  const preferred = shownWeekOf(focusDate(item), weeks)
  if (preferred !== null || item === undefined || !isBooking(item)) return preferred
  return shownWeekOf(item.date, weeks)
}

function movingText(booking: BoardBooking, today: string): string {
  const what = `Moving ${booking.applicationNumber}, ${booking.typeLabel}`
  const clock = minutesToClock(booking.startMinute)
  const day = weekdayName(booking.date)
  if (booking.date < today) {
    return `${what}, booked ${day}, ${formatCivilDate(booking.date)} at ${clock} with ${booking.inspectorName}, result owed.`
  }
  return `${what}, booked ${day} ${clock} with ${booking.inspectorName}.`
}

export function promptText(item: BoardItem | undefined, today: string): string {
  if (item === undefined) return 'Choose a request, then an open time.'
  if (isBooking(item)) return movingText(item, today)
  return `Pick a time for ${item.applicationNumber}, ${item.typeLabel}.`
}

export function matchesQuery(item: BoardItem, query: string): boolean {
  if (query === '') return true
  const haystack =
    `${item.applicationNumber} ${item.typeLabel} ${item.address} ${item.contactName}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}
