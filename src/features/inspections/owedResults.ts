import { and, asc, eq, lt } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, inspections, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { inspectionVisibleTo } from '@/features/inspections/visibility'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface OwedResultRow {
  inspectionId: string
  applicationId: string
  applicationNumber: string
  typeLabel: string
  inspectorName: string | null
  scheduledDate: CivilDate
  daysLate: number
}

export async function listOwedResults(
  db: DbOrTx,
  actor: Actor,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Result<OwedResultRow[], 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'inspection.schedule', signal)
  if (!allowed.ok) return err('forbidden')
  const rows = await db
    .select({
      inspectionId: inspections.id,
      applicationId: inspections.applicationId,
      applicationNumber: applications.number,
      inspectionType: inspections.inspectionType,
      inspectorName: users.displayName,
      scheduledDate: inspections.scheduledDate,
    })
    .from(inspections)
    .innerJoin(applications, eq(applications.id, inspections.applicationId))
    .leftJoin(users, eq(users.id, inspections.inspectorUserId))
    .where(
      and(
        eq(inspections.status, 'scheduled'),
        lt(inspections.scheduledDate, today),
        inspectionVisibleTo(actor),
      ),
    )
    .orderBy(asc(inspections.scheduledDate), asc(inspections.startMinute), asc(inspections.id))
  return ok(
    rows.map((row) => {
      const scheduledDate = row.scheduledDate as CivilDate
      return {
        inspectionId: row.inspectionId,
        applicationId: row.applicationId,
        applicationNumber: row.applicationNumber,
        typeLabel: inspectionTypeLabel(row.inspectionType),
        inspectorName: row.inspectorName,
        scheduledDate,
        daysLate: daysBetween(scheduledDate, today),
      }
    }),
  )
}
