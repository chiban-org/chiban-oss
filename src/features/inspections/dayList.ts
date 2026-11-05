import { and, asc, eq, gt, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { inspections } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { HonestValue } from '@/features/honest/honest'
import { inspectionTypeLabel, loadSiteInfo } from '@/features/inspections/siteInfo'
import { inspectionVisibleTo, managesAllInspectors } from '@/features/inspections/visibility'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface DayListRow {
  inspectionId: string
  startMinute: number
  durationMinutes: number
  inspectionType: string
  typeLabel: string
  applicationNumber: string
  siteAddress: HonestValue<string>
  parcelDisplayId: string | null
  contactName: string
  contactPhone: string | null
  accessNotes: string | null
  isReinspection: boolean
  previousFailureNotes: string | null
  status: 'scheduled' | 'passed' | 'failed'
  rowVersion: number
}

export async function mayReadDay(
  db: DbOrTx,
  actor: Actor,
  inspectorUserId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (actor.userId === inspectorUserId) {
    return await hasCapability(db, actor.userId, 'inspection.record', signal)
  }
  return (
    managesAllInspectors(actor) &&
    (await hasCapability(db, actor.userId, 'inspection.schedule', signal))
  )
}

export async function getDayList(
  db: DbOrTx,
  actor: Actor,
  input: { inspectorUserId: string; date: CivilDate },
  signal: AbortSignal,
  deps: { now?: Date } = {},
): Promise<Result<DayListRow[], 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await mayReadDay(db, actor, input.inspectorUserId, signal))) return err('forbidden')
  const rows = await db
    .select()
    .from(inspections)
    .where(
      and(
        eq(inspections.inspectorUserId, input.inspectorUserId),
        eq(inspections.scheduledDate, input.date),
        inArray(inspections.status, ['scheduled', 'passed', 'failed']),
        inspectionVisibleTo(actor),
      ),
    )
    .orderBy(asc(inspections.startMinute), asc(inspections.id))
  const now = deps.now ?? new Date()
  const out: DayListRow[] = []
  for (const row of rows) {
    const site = await loadSiteInfo(db, row.applicationId, now, signal)
    if (site === null || row.startMinute === null || row.durationMinutes === null) continue
    const previous =
      row.reinspectionOf === null
        ? undefined
        : (await db.select().from(inspections).where(eq(inspections.id, row.reinspectionOf)))[0]
    out.push({
      inspectionId: row.id,
      startMinute: row.startMinute,
      durationMinutes: row.durationMinutes,
      inspectionType: row.inspectionType,
      typeLabel: inspectionTypeLabel(row.inspectionType),
      applicationNumber: site.applicationNumber,
      siteAddress: site.siteAddress,
      parcelDisplayId: site.parcelDisplayId,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
      accessNotes: row.accessNotes,
      isReinspection: row.reinspectionOf !== null,
      previousFailureNotes: previous?.resultNotes ?? null,
      status: row.status as DayListRow['status'],
      rowVersion: row.rowVersion,
    })
  }
  return ok(out)
}

export async function nextDayWithInspections(
  db: DbOrTx,
  actor: Actor,
  input: { inspectorUserId: string; date: CivilDate },
  signal: AbortSignal,
): Promise<CivilDate | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ date: inspections.scheduledDate })
    .from(inspections)
    .where(
      and(
        eq(inspections.inspectorUserId, input.inspectorUserId),
        gt(inspections.scheduledDate, input.date),
        inArray(inspections.status, ['scheduled', 'passed', 'failed']),
        inspectionVisibleTo(actor),
      ),
    )
    .orderBy(asc(inspections.scheduledDate))
    .limit(1)
  return (row?.date ?? null) as CivilDate | null
}
