import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  type BackupScheduleRow,
  backupSchedule,
  type ExportTargetRow,
  exportTargets,
} from '@/db/schema'
import type { BackupError, BackupReport } from '@/features/backup/createBackup'
import type { StorageTarget } from '@/features/export/targets/types'
import { err, type Result } from '@/types/result'
import { advanceDue, isBackupDue } from './backupDue'
import { describeBackupError, NO_PASSPHRASE, TARGET_GONE, unusableTarget } from './backupErrors'
import { pruneBackups } from './prune'
import { readBackupSchedule, SCHEDULE_ID, townZone } from './scheduleStore'

export interface ScheduledBackupDeps {
  passphrase: string | undefined
  now(): Date
  build(row: ExportTargetRow): Result<StorageTarget, 'bad_settings' | 'bad_credentials'>
  backup(
    target: StorageTarget,
    passphrase: string,
    signal: AbortSignal,
  ): Promise<Result<BackupReport, BackupError>>
}

export type ScheduledOutcome = 'off' | 'not_due' | 'skipped' | 'failed' | 'succeeded'

interface Run {
  db: Db
  deps: ScheduledBackupDeps
  signal: AbortSignal
}

async function update(run: Run, values: Partial<BackupScheduleRow>): Promise<void> {
  await run.db.update(backupSchedule).set(values).where(eq(backupSchedule.id, SCHEDULE_ID))
}

async function problem(
  run: Run,
  kind: 'failed' | 'skipped',
  message: string,
): Promise<ScheduledOutcome> {
  await update(run, { lastFailureAt: run.deps.now(), lastFailureKind: kind, lastError: message })
  return kind
}

async function targetFor(run: Run, targetId: string): Promise<Result<StorageTarget, string>> {
  const [row] = await run.db
    .select()
    .from(exportTargets)
    .where(eq(exportTargets.id, targetId))
    .limit(1)
  if (row === undefined) return err(TARGET_GONE)
  const built = run.deps.build(row)
  return built.ok ? built : err(unusableTarget(row.name, built.error))
}

async function succeed(
  run: Run,
  row: BackupScheduleRow,
  report: BackupReport,
  target: StorageTarget,
): Promise<ScheduledOutcome> {
  const finished = run.deps.now()
  const zone = await townZone(run.db, run.signal)
  await update(run, {
    lastSuccessAt: finished,
    lastSuccessPath: report.path,
    lastSuccessBytes: report.sizeBytes,
    nextDueAt: advanceDue(row.nextDueAt ?? finished, row, zone, finished),
  })
  const pruned = await pruneBackups(target, row.keepCount, report.path, run.signal)
  await update(run, { lastPruneError: pruned.ok ? null : pruned.error.detail })
  return 'succeeded'
}

export async function runScheduledBackup(
  db: Db,
  deps: ScheduledBackupDeps,
  signal: AbortSignal,
): Promise<ScheduledOutcome> {
  const run: Run = { db, deps, signal }
  const row = await readBackupSchedule(db, signal)
  if (row?.targetId == null) return 'off'
  const started = deps.now()
  if (!isBackupDue(row, started)) return 'not_due'
  await update(run, { runRequestedAt: null, lastStartedAt: started })
  if (deps.passphrase === undefined) return await problem(run, 'skipped', NO_PASSPHRASE)
  const target = await targetFor(run, row.targetId)
  if (!target.ok) return await problem(run, 'failed', target.error)
  const made = await deps.backup(target.value, deps.passphrase, signal)
  if (!made.ok) return await problem(run, 'failed', describeBackupError(made.error))
  return await succeed(run, row, made.value, target.value)
}
