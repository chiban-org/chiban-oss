import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, inspections, projects, users } from '@/db/schema'
import { nextScheduled } from '@/features/inspections/inspectorFocus'

export async function loadNextLotInspection(db: DbOrTx, parcelId: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const rows = await db
    .select({
      id: inspections.id,
      applicationId: inspections.applicationId,
      number: applications.number,
      status: inspections.status,
      inspectionType: inspections.inspectionType,
      reinspectionOf: inspections.reinspectionOf,
      inspectorUserId: inspections.inspectorUserId,
      inspectorName: users.displayName,
      scheduledDate: inspections.scheduledDate,
      startMinute: inspections.startMinute,
      resultRecordedAt: inspections.resultRecordedAt,
      contactName: inspections.contactName,
      contactPhone: inspections.contactPhone,
      accessNotes: inspections.accessNotes,
    })
    .from(inspections)
    .innerJoin(applications, eq(applications.id, inspections.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .leftJoin(users, eq(users.id, inspections.inspectorUserId))
    .where(and(eq(projects.parcelId, parcelId), eq(inspections.status, 'scheduled')))
  return nextScheduled(rows)
}

export type LotInspection = NonNullable<Awaited<ReturnType<typeof loadNextLotInspection>>>
