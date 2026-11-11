import { eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { type BackupScheduleRow, backupSchedule, exportTargets } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { getTownSettings } from '@/features/town/settings'
import { DEFAULT_TIME_ZONE } from '@/features/town/timeZone'
import { err, ok, type Result } from '@/types/result'
import { firstSlotAtOrAfter } from './backupDue'

export const SCHEDULE_ID = 1

export interface BackupScheduleInput {
  targetId: string | null
  frequency: BackupScheduleRow['frequency']
  startHour: number
  keepCount: number
}

export async function readBackupSchedule(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<BackupScheduleRow | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select()
    .from(backupSchedule)
    .where(eq(backupSchedule.id, SCHEDULE_ID))
    .limit(1)
  return row ?? null
}

export async function townZone(db: DbOrTx, signal: AbortSignal): Promise<string> {
  const town = await getTownSettings(db, signal)
  return town.ok ? town.value.timeZone : DEFAULT_TIME_ZONE
}

async function allowed(db: Db, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return (await requireCapability(db, actor.userId, 'config.edit', signal)).ok
}

function timing(
  previous: BackupScheduleRow | null,
  input: BackupScheduleInput,
  zone: string,
  now: Date,
): Pick<BackupScheduleRow, 'scheduledSince' | 'nextDueAt'> {
  if (input.targetId === null) return { scheduledSince: null, nextDueAt: null }
  const wasOn = previous?.targetId != null
  const sameTiming =
    wasOn && previous.frequency === input.frequency && previous.startHour === input.startHour
  return {
    scheduledSince: wasOn ? previous.scheduledSince : now,
    nextDueAt:
      sameTiming && previous.nextDueAt !== null
        ? previous.nextDueAt
        : firstSlotAtOrAfter(now, input.startHour, zone),
  }
}

export async function saveBackupSchedule(
  db: Db,
  actor: Actor,
  { at: now, ...input }: BackupScheduleInput & { at: Date },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  const zone = await townZone(db, signal)
  return await transactionResult(db, async (tx) => {
    if (input.targetId !== null) {
      const [target] = await tx
        .select({ id: exportTargets.id })
        .from(exportTargets)
        .where(eq(exportTargets.id, input.targetId))
        .limit(1)
      if (target === undefined) return err('not_found' as const)
    }
    const previous = await readBackupSchedule(tx, signal)
    const values = {
      ...input,
      ...timing(previous, input, zone, now),
      ...(input.targetId === null ? { runRequestedAt: null } : {}),
      updatedAt: now,
    }
    await tx
      .insert(backupSchedule)
      .values({ id: SCHEDULE_ID, ...values })
      .onConflictDoUpdate({ target: backupSchedule.id, set: values })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'backup_schedule.edit',
        entityType: 'backup_schedule',
        entityId: String(SCHEDULE_ID),
        after: input,
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function requestBackupNow(
  db: Db,
  actor: Actor,
  now: Date,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_scheduled'>> {
  signal.throwIfAborted()
  if (!(await allowed(db, actor, signal))) return err('forbidden')
  const row = await readBackupSchedule(db, signal)
  if (row?.targetId == null) return err('not_scheduled')
  await db
    .update(backupSchedule)
    .set({ runRequestedAt: now })
    .where(eq(backupSchedule.id, SCHEDULE_ID))
  return ok(undefined)
}
