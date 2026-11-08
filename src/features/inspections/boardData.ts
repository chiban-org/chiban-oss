import { and, asc, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { inspections, inspectorCalendars, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { honestText } from '@/features/honest/honest'
import {
  availability,
  type DayAvailability,
  listInspectors,
} from '@/features/inspections/availability'
import { getInspectionSettings } from '@/features/inspections/inspectionSettings'
import { listOwedResults } from '@/features/inspections/owedResults'
import type { InspectionSettingsBody } from '@/features/inspections/settingsSchema'
import { inspectionTypeLabel, loadSiteInfo } from '@/features/inspections/siteInfo'
import { isPhoneRequestTime, schedulingDates } from '@/features/inspections/slots'
import { inspectionVisibleTo } from '@/features/inspections/visibility'
import { utcToLocal } from '@/features/inspections/zonedTime'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { getTownSettings } from '@/features/town/settings'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const BOARD_DAYS = 14

export interface BoardRequestRow {
  inspectionId: string
  rowVersion: number
  applicationNumber: string
  typeLabel: string
  channel: 'phone' | 'counter' | 'portal'
  preferredDate: string | null
  isReinspection: boolean
  address: string
  contactName: string
}

export interface BoardBookingRow extends BoardRequestRow {
  inspectorUserId: string
  inspectorName: string
  date: string
  startMinute: number
  durationMinutes: number
}

export interface ScheduleBoardData {
  requests: BoardRequestRow[]
  bookings: BoardBookingRow[]
  days: (DayAvailability & { inspectorName: string })[]
  inspectors: { userId: string; name: string; calendarKind: 'ics_email' | 'graph' }[]
  settings: InspectionSettingsBody
  today: CivilDate
  owedCount: number
  outsidePhoneHours: boolean
}

type InspectionRow = typeof inspections.$inferSelect

interface BookingSlot {
  inspectorUserId: string
  date: string
  startMinute: number
  durationMinutes: number
}

function bookingSlot(
  row: InspectionRow,
  context: { today: CivilDate; pinnedId: string | null; slotMinutes: number },
): BookingSlot | null {
  const { inspectorUserId, scheduledDate, startMinute } = row
  if (inspectorUserId === null || scheduledDate === null || startMinute === null) return null
  if (scheduledDate < context.today && row.id !== context.pinnedId) return null
  return {
    inspectorUserId,
    date: scheduledDate,
    startMinute,
    durationMinutes: row.durationMinutes ?? context.slotMinutes,
  }
}

async function inspectorNames(
  db: DbOrTx,
  inspectorRows: { userId: string; name: string }[],
  rows: InspectionRow[],
): Promise<Map<string, string>> {
  const names = new Map(inspectorRows.map((i) => [i.userId, i.name]))
  const missing = [
    ...new Set(rows.map((r) => r.inspectorUserId).filter((id): id is string => id !== null)),
  ].filter((id) => !names.has(id))
  if (missing.length === 0) return names
  const found = await db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, missing))
  for (const user of found) names.set(user.id, user.name)
  return names
}

async function loadEntries(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
  context: {
    now: Date
    today: CivilDate
    pinnedId: string | null
    slotMinutes: number
    inspectorRows: { userId: string; name: string }[]
  },
): Promise<{ requests: BoardRequestRow[]; bookings: BoardBookingRow[] }> {
  const rows = await db
    .select()
    .from(inspections)
    .where(and(inArray(inspections.status, ['requested', 'scheduled']), inspectionVisibleTo(actor)))
    .orderBy(asc(inspections.requestedAt))
  const names = await inspectorNames(db, context.inspectorRows, rows)
  const requests: BoardRequestRow[] = []
  const bookings: BoardBookingRow[] = []
  for (const row of rows) {
    const slot = row.status === 'requested' ? null : bookingSlot(row, context)
    if (row.status !== 'requested' && slot === null) continue
    const site = await loadSiteInfo(db, row.applicationId, context.now, signal)
    if (site === null) continue
    const entry = {
      inspectionId: row.id,
      rowVersion: row.rowVersion,
      applicationNumber: site.applicationNumber,
      typeLabel: inspectionTypeLabel(row.inspectionType),
      channel: row.channel,
      preferredDate: row.preferredDate,
      isReinspection: row.reinspectionOf !== null,
      address: honestText(site.siteAddress, 'Address not on file'),
      contactName: row.contactName,
    }
    if (slot === null) requests.push(entry)
    else
      bookings.push({
        ...entry,
        ...slot,
        inspectorName: names.get(slot.inspectorUserId) ?? 'Inspector',
      })
  }
  return { requests, bookings }
}

export async function loadScheduleBoard(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
  options: { now?: Date; pinnedId?: string | null } = {},
): Promise<Result<ScheduleBoardData, 'forbidden'>> {
  signal.throwIfAborted()
  const now = options.now ?? new Date()
  const allowed = await requireCapability(db, actor.userId, 'inspection.schedule', signal)
  if (!allowed.ok) return err('forbidden')
  const settings = await getInspectionSettings(db, signal)
  const today = await townToday(db, now, signal)
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : 'America/New_York'
  const holidays = packHolidayCalendar()
  const open = schedulingDates(settings, holidays, today)
  const last = open[Math.min(open.length, BOARD_DAYS) - 1]
  const inspectorRows = await listInspectors(db, signal)
  const targets = await db.select().from(inspectorCalendars)
  const days =
    last === undefined ? [] : await availability(db, { from: today, to: last }, today, signal)
  const { requests, bookings } = await loadEntries(db, actor, signal, {
    now,
    today,
    pinnedId: options.pinnedId ?? null,
    slotMinutes: settings.slotMinutes,
    inspectorRows,
  })
  const names = new Map(inspectorRows.map((i) => [i.userId, i.name]))
  const owed = await listOwedResults(db, actor, today, signal)
  return ok({
    requests,
    bookings,
    days: days.map((d) => ({ ...d, inspectorName: names.get(d.inspectorUserId) ?? 'Inspector' })),
    inspectors: inspectorRows.map((i) => ({
      userId: i.userId,
      name: i.name,
      calendarKind: targets.find((t) => t.userId === i.userId)?.kind ?? 'ics_email',
    })),
    settings,
    today,
    owedCount: owed.ok ? owed.value.length : 0,
    outsidePhoneHours: !isPhoneRequestTime(settings, holidays, utcToLocal(now, zone)),
  })
}
