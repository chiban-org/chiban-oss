import { and, eq, lt } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { calendarPushes, inspections, inspectorCalendars } from '@/db/schema'

export const CALENDAR_SWEEP_AFTER_SECONDS = 60
export const MAX_PUSH_ATTEMPTS = 5

export interface PushInput {
  inspectionId: string
  sequence: number
  op: 'publish' | 'cancel'
  inspectorUserId: string
  slot?: { date: string; startMinute: number; durationMinutes: number }
}

export async function queueCalendarPush(
  tx: Tx,
  input: PushInput,
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted()
  const slot = input.slot ?? (await currentSlot(tx, input.inspectionId))
  if (slot === null) return null
  const [target] = await tx
    .select({ kind: inspectorCalendars.kind })
    .from(inspectorCalendars)
    .where(eq(inspectorCalendars.userId, input.inspectorUserId))
  const [row] = await tx
    .insert(calendarPushes)
    .values({
      inspectionId: input.inspectionId,
      sequence: input.sequence,
      op: input.op,
      inspectorUserId: input.inspectorUserId,
      targetKind: target?.kind ?? 'ics_email',
      scheduledDate: slot.date,
      startMinute: slot.startMinute,
      durationMinutes: slot.durationMinutes,
    })
    .onConflictDoNothing()
    .returning({ id: calendarPushes.id })
  return row?.id ?? null
}

async function currentSlot(
  tx: DbOrTx,
  inspectionId: string,
): Promise<{ date: string; startMinute: number; durationMinutes: number } | null> {
  const [row] = await tx.select().from(inspections).where(eq(inspections.id, inspectionId))
  if (row?.scheduledDate == null || row.startMinute === null || row.durationMinutes === null) {
    return null
  }
  return {
    date: row.scheduledDate,
    startMinute: row.startMinute,
    durationMinutes: row.durationMinutes,
  }
}

export async function overdueCalendarPushes(db: DbOrTx, now: Date, signal: AbortSignal) {
  signal.throwIfAborted()
  const cutoff = new Date(now.getTime() - CALENDAR_SWEEP_AFTER_SECONDS * 1000)
  return await db
    .select()
    .from(calendarPushes)
    .where(and(eq(calendarPushes.status, 'queued'), lt(calendarPushes.createdAt, cutoff)))
}
