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
import {
  describeBackupError,
  NO_PASSPHRASE,
  TARGET_GONE,
  TIMED_OUT,
  unexpectedFailure,
  unusableTarget,
} from './backupErrors'
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

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

async function attempt(
  run: Run,
  targetId: string,
  passphrase: string,
): Promise<{ report: BackupReport; target: StorageTarget } | string> {
  const target = await targetFor(run, targetId)
  if (!target.ok) return target.error
  const made = await run.deps.backup(target.value, passphrase, run.signal)
  if (!made.ok) return describeBackupError(made.error)
  return { report: made.value, target: target.value }
}

async function prune(run: Run, target: StorageTarget, keep: number, written: string) {
  try {
    const pruned = await pruneBackups(target, keep, written, run.signal)
    return pruned.ok ? null : pruned.error.detail
  } catch (e) {
    if (isAbort(e)) throw e
    return e instanceof Error ? e.message : String(e)
  }
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
  await update(run, { lastPruneError: await prune(run, target, row.keepCount, report.path) })
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
  const passphrase = deps.passphrase
  let made: { report: BackupReport; target: StorageTarget } | string
  try {
    made = await attempt(run, row.targetId, passphrase)
  } catch (e) {
    const aborted = isAbort(e)
    await problem(run, 'failed', aborted ? TIMED_OUT : unexpectedFailure(e))
    if (aborted) throw e
    return 'failed'
  }
  if (typeof made === 'string') return await problem(run, 'failed', made)
  return await succeed(run, row, made.report, made.target)
}
