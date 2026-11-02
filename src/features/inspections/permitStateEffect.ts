import { and, eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { type InspectionCancelReason, inspections } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { queueCalendarPush } from '@/features/calendar/queuePush'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { INSPECTION_PARTY_ROLES, queueForParties } from '@/features/notifications/queue'

export type PermitStateReason = Extract<
  InspectionCancelReason,
  'permit_suspended' | 'permit_expired' | 'permit_closed'
>

const SYSTEM_JOB = 'inspections.permit_state'

export async function cancelOpenInspections(
  tx: Tx,
  applicationId: string,
  reason: PermitStateReason,
  signal: AbortSignal,
): Promise<{ cancelled: number; pushIds: string[] }> {
  signal.throwIfAborted()
  const open = await tx
    .select()
    .from(inspections)
    .where(
      and(
        eq(inspections.applicationId, applicationId),
        inArray(inspections.status, ['requested', 'scheduled']),
      ),
    )
    .for('update')
  const pushIds: string[] = []
  for (const inspection of open) {
    if (
      inspection.status === 'scheduled' &&
      inspection.inspectorUserId !== null &&
      inspection.scheduledDate !== null &&
      inspection.startMinute !== null &&
      inspection.durationMinutes !== null
    ) {
      const pushId = await queueCalendarPush(
        tx,
        {
          inspectionId: inspection.id,
          sequence: inspection.calendarSequence,
          op: 'cancel',
          inspectorUserId: inspection.inspectorUserId,
        },
        signal,
      )
      if (pushId !== null) pushIds.push(pushId)
    }
    await tx
      .update(inspections)
      .set({
        status: 'cancelled',
        cancelReason: reason,
        rowVersion: inspection.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(inspections.id, inspection.id))
    await queueForParties(
      tx,
      {
        event: 'inspection_cancelled',
        applicationId,
        discriminator: `${inspection.id}:cancelled`,
        extra: { inspectionLabel: inspectionTypeLabel(inspection.inspectionType) },
        roles: INSPECTION_PARTY_ROLES,
      },
      signal,
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'system', job: SYSTEM_JOB },
        action: 'inspection.cancel',
        entityType: 'inspection',
        entityId: inspection.id,
        before: { status: inspection.status },
        after: { status: 'cancelled', reason },
      },
      signal,
    )
  }
  return { cancelled: open.length, pushIds }
}
