import { and, asc, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { inspections, inspectorCalendars } from '@/db/schema'
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
import { minutesToClock, utcToLocal } from '@/features/inspections/zonedTime'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { getTownSettings } from '@/features/town/settings'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
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

export interface ScheduleBoardData {
  requests: BoardRequestRow[]
  scheduledAhead: (BoardRequestRow & { scheduledFor: string })[]
  days: (DayAvailability & { inspectorName: string })[]
  inspectors: { userId: string; name: string; calendarKind: 'ics_email' | 'graph' }[]
  settings: InspectionSettingsBody
  today: CivilDate
  owedCount: number
  outsidePhoneHours: boolean
}

function bookingText(
  row: {
    id: string
    scheduledDate: string | null
    startMinute: number | null
    inspectorUserId: string | null
  },
  context: { today: CivilDate; pinnedId: string | null; names: ReadonlyMap<string, string> },
): string | null {
  if (row.scheduledDate === null || row.startMinute === null) return null
  const owed = row.scheduledDate < context.today
  if (owed && row.id !== context.pinnedId) return null
  const who = context.names.get(row.inspectorUserId ?? '') ?? 'Inspector'
  const booked = `${formatCivilDate(row.scheduledDate)} at ${minutesToClock(row.startMinute)}, ${who}`
  return owed ? `${booked}, result owed` : booked
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
  const waiting = await db
    .select()
    .from(inspections)
    .where(and(inArray(inspections.status, ['requested', 'scheduled']), inspectionVisibleTo(actor)))
    .orderBy(asc(inspections.requestedAt))
  const requests: BoardRequestRow[] = []
  const scheduledAhead: ScheduleBoardData['scheduledAhead'] = []
  const names = new Map(inspectorRows.map((i) => [i.userId, i.name]))
  const pinnedId = options.pinnedId ?? null
  for (const row of waiting) {
    const scheduledFor =
      row.status === 'requested' ? null : bookingText(row, { today, pinnedId, names })
    if (row.status !== 'requested' && scheduledFor === null) continue
    const site = await loadSiteInfo(db, row.applicationId, now, signal)
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
    if (scheduledFor === null) requests.push(entry)
    else scheduledAhead.push({ ...entry, scheduledFor })
  }
  const owed = await listOwedResults(db, actor, today, signal)
  return ok({
    requests,
    scheduledAhead,
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
