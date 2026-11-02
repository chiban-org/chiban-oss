import { and, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { inspections, userRoles, users } from '@/db/schema'
import { getInspectionSettings } from '@/features/inspections/inspectionSettings'
import { schedulingDates, slotStarts } from '@/features/inspections/slots'
import { packHolidayCalendar } from '@/features/packs/holidays'
import type { CivilDate } from '@/types/civilDate'

export interface DayAvailability {
  date: CivilDate
  inspectorUserId: string
  freeStarts: number[]
  booked: number
}

export async function listInspectors(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<{ userId: string; name: string }[]> {
  signal.throwIfAborted()
  return await db
    .selectDistinct({ userId: users.id, name: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, 'inspector'), eq(users.isActive, true)))
    .orderBy(users.displayName)
}

export async function availability(
  db: DbOrTx,
  range: { inspectorUserId?: string; from: CivilDate; to: CivilDate },
  today: CivilDate,
  signal: AbortSignal,
): Promise<DayAvailability[]> {
  signal.throwIfAborted()
  const settings = await getInspectionSettings(db, signal)
  const dates = schedulingDates(settings, packHolidayCalendar(), today).filter(
    (d) => d >= range.from && d <= range.to,
  )
  const inspectors =
    range.inspectorUserId === undefined
      ? (await listInspectors(db, signal)).map((i) => i.userId)
      : [range.inspectorUserId]
  if (dates.length === 0 || inspectors.length === 0) return []
  const booked = await db
    .select({
      inspectorUserId: inspections.inspectorUserId,
      date: inspections.scheduledDate,
      start: inspections.startMinute,
    })
    .from(inspections)
    .where(
      and(
        eq(inspections.status, 'scheduled'),
        inArray(inspections.inspectorUserId, inspectors),
        inArray(inspections.scheduledDate, dates),
      ),
    )
  const starts = slotStarts(settings)
  return dates.flatMap((date) =>
    inspectors.map((inspectorUserId) => {
      const taken = booked.filter((b) => b.inspectorUserId === inspectorUserId && b.date === date)
      const takenStarts = new Set(taken.map((t) => t.start))
      return {
        date,
        inspectorUserId,
        freeStarts: starts.filter((s) => !takenStarts.has(s)),
        booked: taken.length,
      }
    }),
  )
}
