import { describe, expect, it } from 'vitest'
import type { BackupScheduleRow } from '@/db/schema'
import { BACKUP_GRACE_MS, backupAlerts } from '@/features/health/backupAlerts'

const DAY_MS = 24 * 60 * 60 * 1000
const SINCE = new Date('2027-03-01T12:00:00Z')

function schedule(over: Partial<BackupScheduleRow> = {}): BackupScheduleRow {
  return {
    id: 1,
    targetId: '00000000-0000-4000-8000-000000000001',
    frequency: 'daily',
    startHour: 1,
    keepCount: 14,
    scheduledSince: SINCE,
    nextDueAt: new Date('2027-03-02T06:00:00Z'),
    runRequestedAt: null,
    lastStartedAt: null,
    lastSuccessAt: null,
    lastSuccessPath: null,
    lastSuccessBytes: null,
    lastFailureAt: null,
    lastFailureKind: null,
    lastError: null,
    lastPruneError: null,
    updatedAt: SINCE,
    ...over,
  }
}

const at = (ms: number) => new Date(SINCE.getTime() + ms)

describe('backupAlerts', () => {
  it('raises nothing when backups are off or not set up', () => {
    expect(backupAlerts(null, at(30 * DAY_MS))).toEqual([])
    expect(backupAlerts(schedule({ targetId: null }), at(30 * DAY_MS))).toEqual([])
  })

  it('is overdue once a daily backup is missing for a day plus the grace', () => {
    const limit = DAY_MS + BACKUP_GRACE_MS
    expect(backupAlerts(schedule(), at(limit))).toEqual([])
    const late = backupAlerts(schedule(), at(limit + 1))
    expect(late).toHaveLength(1)
    expect(late[0]).toMatchObject({
      key: 'backup:overdue',
      kind: 'backup_overdue',
      severity: 'critical',
      summary: 'No backup has succeeded for more than a day. Backups are set to run every day.',
    })
  })

  it('measures a weekly schedule from its last success', () => {
    const lastSuccessAt = at(3 * DAY_MS)
    const weekly = schedule({ frequency: 'weekly', lastSuccessAt })
    expect(backupAlerts(weekly, at(9 * DAY_MS))).toEqual([])
    const late = backupAlerts(weekly, new Date(lastSuccessAt.getTime() + 8 * DAY_MS))
    expect(late.map((a) => a.summary)).toEqual([
      'No backup has succeeded for more than a week. Backups are set to run every week.',
    ])
  })

  it('raises a failure alert while the last run failed or was skipped', () => {
    const failed = schedule({
      lastSuccessAt: at(DAY_MS),
      lastFailureAt: at(2 * DAY_MS),
      lastFailureKind: 'failed',
      lastError: 'The database dump failed.',
    })
    expect(backupAlerts(failed, at(2 * DAY_MS + 1))).toEqual([
      {
        key: 'backup:failed',
        kind: 'backup_failed',
        severity: 'critical',
        summary: 'The last backup failed: The database dump failed.',
      },
    ])
    const skipped = schedule({
      lastFailureAt: at(60_000),
      lastFailureKind: 'skipped',
      lastError: 'BACKUP_PASSPHRASE is not set on the server.',
    })
    expect(backupAlerts(skipped, at(120_000)).map((a) => a.summary)).toEqual([
      'The last backup did not run: BACKUP_PASSPHRASE is not set on the server.',
    ])
  })

  it('clears the failure alert once a later backup succeeds', () => {
    const recovered = schedule({
      lastFailureAt: at(DAY_MS),
      lastFailureKind: 'failed',
      lastError: 'x',
      lastSuccessAt: at(DAY_MS + 60_000),
    })
    expect(backupAlerts(recovered, at(DAY_MS + 120_000))).toEqual([])
  })
})
