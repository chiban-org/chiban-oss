import type { BackupScheduleRow } from '@/db/schema'
import { FREQUENCY_MS } from '@/features/backup/schedule/backupDue'
import type { EvaluatedAlert } from './evaluateAlerts'

export const BACKUP_GRACE_MS = 12 * 60 * 60 * 1000

const OVERDUE_COPY: Record<BackupScheduleRow['frequency'], string> = {
  daily: 'No backup has succeeded for more than a day. Backups are set to run every day.',
  weekly: 'No backup has succeeded for more than a week. Backups are set to run every week.',
}

const PROBLEM_LEAD: Record<NonNullable<BackupScheduleRow['lastFailureKind']>, string> = {
  failed: 'The last backup failed',
  skipped: 'The last backup did not run',
}

function overdue(row: BackupScheduleRow, now: Date): EvaluatedAlert | null {
  const reference = row.lastSuccessAt ?? row.scheduledSince
  if (reference === null) return null
  const limit = FREQUENCY_MS[row.frequency] + BACKUP_GRACE_MS
  if (now.getTime() - reference.getTime() <= limit) return null
  return {
    key: 'backup:overdue',
    kind: 'backup_overdue',
    severity: 'critical',
    summary: OVERDUE_COPY[row.frequency],
  }
}

function failed(row: BackupScheduleRow): EvaluatedAlert | null {
  if (row.lastFailureAt === null) return null
  if (row.lastSuccessAt !== null && row.lastSuccessAt.getTime() > row.lastFailureAt.getTime()) {
    return null
  }
  const lead = PROBLEM_LEAD[row.lastFailureKind ?? 'failed']
  return {
    key: 'backup:failed',
    kind: 'backup_failed',
    severity: 'critical',
    summary: `${lead}: ${row.lastError ?? 'no reason was recorded.'}`,
  }
}

export function backupAlerts(row: BackupScheduleRow | null, now: Date): EvaluatedAlert[] {
  if (row?.targetId == null) return []
  return [overdue(row, now), failed(row)].filter((a): a is EvaluatedAlert => a !== null)
}
