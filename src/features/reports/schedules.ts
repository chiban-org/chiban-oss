import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { reportScheduleRecipients, reportSchedules } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { canManageSchedule } from '@/features/reports/scheduleAccess'
import {
  type ScheduleError,
  type ScheduleFieldsInput,
  validated,
} from '@/features/reports/scheduleInput'
import { firstRunOnOrAfter } from '@/features/reports/schedulePeriod'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

interface Clocked {
  now?: Date
}

type ScheduleRow = typeof reportSchedules.$inferSelect

async function writeRecipients(tx: Tx, scheduleId: string, ids: string[]): Promise<void> {
  await tx
    .delete(reportScheduleRecipients)
    .where(eq(reportScheduleRecipients.scheduleId, scheduleId))
  await tx
    .insert(reportScheduleRecipients)
    .values([...new Set(ids)].map((userId) => ({ scheduleId, userId })))
}

interface AuditInput {
  actor: Actor
  action: string
  after: { id: string } & Record<string, unknown>
  signal: AbortSignal
}

async function audit(tx: Tx, { actor, action, after, signal }: AuditInput) {
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: `report_schedule.${action}`,
      entityType: 'report_schedule',
      entityId: after.id,
      after,
    },
    signal,
  )
}

export async function createSchedule(
  db: Db,
  actor: Actor,
  input: ScheduleFieldsInput & Clocked,
  signal: AbortSignal,
): Promise<Result<{ id: string }, ScheduleError>> {
  signal.throwIfAborted()
  if (!(await canManageSchedule(db, actor.userId, input.report, signal))) return err('forbidden')
  const checked = await validated(db, input)
  if (!checked.ok) return checked
  const today = await townToday(db, input.now ?? new Date(), signal)
  const { report, frequency, recipientIds } = checked.value
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(reportSchedules)
      .values({
        report,
        frequency,
        nextRunOn: firstRunOnOrAfter(frequency, today),
        createdBy: actor.userId,
      })
      .returning({ id: reportSchedules.id })
    if (row === undefined) return err('not_found')
    await writeRecipients(tx, row.id, recipientIds)
    await audit(tx, {
      actor,
      action: 'create',
      after: { id: row.id, report, frequency, recipientIds },
      signal,
    })
    return ok({ id: row.id })
  })
}

async function managed(
  db: Db,
  actor: Actor,
  id: string,
  signal: AbortSignal,
): Promise<Result<ScheduleRow, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!isUuid(id)) return err('not_found')
  const [row] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, id))
  if (row === undefined) return err('not_found')
  return (await canManageSchedule(db, actor.userId, row.report, signal))
    ? ok(row)
    : err('forbidden')
}

export async function updateSchedule(
  db: Db,
  actor: Actor,
  input: ScheduleFieldsInput & Clocked & { id: string },
  signal: AbortSignal,
): Promise<Result<void, ScheduleError>> {
  const found = await managed(db, actor, input.id, signal)
  if (!found.ok) return found
  if (!(await canManageSchedule(db, actor.userId, input.report, signal))) return err('forbidden')
  const checked = await validated(db, input)
  if (!checked.ok) return checked
  const { report, frequency, recipientIds } = checked.value
  const moved = frequency !== found.value.frequency
  const today = await townToday(db, input.now ?? new Date(), signal)
  return await transactionResult(db, async (tx) => {
    await tx
      .update(reportSchedules)
      .set({
        report,
        frequency,
        updatedAt: new Date(),
        ...(moved ? { nextRunOn: firstRunOnOrAfter(frequency, today) } : {}),
      })
      .where(eq(reportSchedules.id, input.id))
    await writeRecipients(tx, input.id, recipientIds)
    await audit(tx, {
      actor,
      action: 'update',
      after: { id: input.id, report, frequency, recipientIds },
      signal,
    })
    return ok(undefined)
  })
}

export async function setSchedulePaused(
  db: Db,
  actor: Actor,
  input: { id: string; paused: boolean } & Clocked,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  const found = await managed(db, actor, input.id, signal)
  if (!found.ok) return found
  const today = await townToday(db, input.now ?? new Date(), signal)
  const nextRunOn = firstRunOnOrAfter(found.value.frequency, today)
  return await transactionResult(db, async (tx) => {
    await tx
      .update(reportSchedules)
      .set({ paused: input.paused, updatedAt: new Date(), ...(input.paused ? {} : { nextRunOn }) })
      .where(eq(reportSchedules.id, input.id))
    await audit(tx, {
      actor,
      action: input.paused ? 'pause' : 'resume',
      after: { id: input.id },
      signal,
    })
    return ok(undefined)
  })
}

export async function deleteSchedule(
  db: Db,
  actor: Actor,
  input: { id: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  const found = await managed(db, actor, input.id, signal)
  if (!found.ok) return found
  const { report, frequency } = found.value
  return await transactionResult(db, async (tx) => {
    await tx.delete(reportSchedules).where(eq(reportSchedules.id, input.id))
    await audit(tx, { actor, action: 'delete', after: { id: input.id, report, frequency }, signal })
    return ok(undefined)
  })
}
