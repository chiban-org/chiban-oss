import type { Tx } from '@/db/client'
import type { inspections } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { queueCalendarPush } from '@/features/calendar/queuePush'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { INSPECTION_PARTY_ROLES, queueForParties } from '@/features/notifications/queue'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

type InspectionRow = typeof inspections.$inferSelect

export interface Booking {
  inspectionId: string
  inspectorUserId: string
  date: CivilDate
  startMinute: number
  sequence: number
  slotMinutes: number
}

async function queueBookingPushes(
  tx: Tx,
  locked: InspectionRow,
  booking: Booking,
  signal: AbortSignal,
): Promise<string[]> {
  const pushIds: string[] = []
  const previousInspector = locked.inspectorUserId
  const handedOver =
    locked.status === 'scheduled' &&
    previousInspector !== null &&
    previousInspector !== booking.inspectorUserId
  if (handedOver) {
    const cancelId = await queueCalendarPush(
      tx,
      {
        inspectionId: booking.inspectionId,
        sequence: locked.calendarSequence,
        op: 'cancel',
        inspectorUserId: previousInspector,
        slot: {
          date: locked.scheduledDate ?? booking.date,
          startMinute: locked.startMinute ?? booking.startMinute,
          durationMinutes: locked.durationMinutes ?? booking.slotMinutes,
        },
      },
      signal,
    )
    if (cancelId !== null) pushIds.push(cancelId)
  }
  const publishId = await queueCalendarPush(
    tx,
    {
      inspectionId: booking.inspectionId,
      sequence: booking.sequence,
      op: 'publish',
      inspectorUserId: booking.inspectorUserId,
    },
    signal,
  )
  if (publishId !== null) pushIds.push(publishId)
  return pushIds
}

function previousSlot(
  locked: InspectionRow,
): { previousDate: string; previousTime: string } | null {
  if (locked.status !== 'scheduled') return null
  if (locked.scheduledDate === null || locked.startMinute === null) return null
  return {
    previousDate: formatCivilDate(locked.scheduledDate),
    previousTime: minutesToClock(locked.startMinute),
  }
}

function sameSlot(locked: InspectionRow, booking: Booking): boolean {
  return (
    locked.status === 'scheduled' &&
    locked.scheduledDate === booking.date &&
    locked.startMinute === booking.startMinute
  )
}

async function queuePartyBookingNotice(
  tx: Tx,
  locked: InspectionRow,
  booking: Booking,
  signal: AbortSignal,
): Promise<void> {
  if (sameSlot(locked, booking)) return
  const previous = previousSlot(locked)
  await queueForParties(
    tx,
    {
      event: previous === null ? 'inspection_scheduled' : 'inspection_rescheduled',
      applicationId: locked.applicationId,
      discriminator: `${locked.id}:${booking.sequence}`,
      extra: {
        inspectionLabel: inspectionTypeLabel(locked.inspectionType),
        onDate: formatCivilDate(booking.date),
        atTime: minutesToClock(booking.startMinute),
        ...(previous ?? {}),
      },
      roles: INSPECTION_PARTY_ROLES,
    },
    signal,
  )
}

export async function queueBookingNotices(
  tx: Tx,
  locked: InspectionRow,
  booking: Booking,
  signal: AbortSignal,
): Promise<string[]> {
  const pushIds = await queueBookingPushes(tx, locked, booking, signal)
  await queuePartyBookingNotice(tx, locked, booking, signal)
  return pushIds
}

export async function announceCancel(
  tx: Tx,
  actor: Actor,
  cancelled: { locked: InspectionRow; reason: string },
  signal: AbortSignal,
): Promise<string[]> {
  const { locked, reason } = cancelled
  const pushIds: string[] = []
  if (locked.status === 'scheduled' && locked.inspectorUserId !== null) {
    const pushId = await queueCalendarPush(
      tx,
      {
        inspectionId: locked.id,
        sequence: locked.calendarSequence,
        op: 'cancel',
        inspectorUserId: locked.inspectorUserId,
      },
      signal,
    )
    if (pushId !== null) pushIds.push(pushId)
  }
  await queueForParties(
    tx,
    {
      event: 'inspection_cancelled',
      applicationId: locked.applicationId,
      discriminator: `${locked.id}:cancelled`,
      extra: { inspectionLabel: inspectionTypeLabel(locked.inspectionType) },
      roles: INSPECTION_PARTY_ROLES,
    },
    signal,
  )
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'inspection.cancel',
      entityType: 'inspection',
      entityId: locked.id,
      before: { status: locked.status },
      after: { status: 'cancelled', reason },
    },
    signal,
  )
  return pushIds
}
