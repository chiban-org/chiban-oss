import { describe, expect, it } from 'vitest'
import type { BackupScheduleRow } from '@/db/schema'
import {
  advanceDue,
  firstSlotAtOrAfter,
  isBackupDue,
  nextBackupAt,
  RETRY_AFTER_FAILURE_MS,
} from './backupDue'

const ZONE = 'America/New_York'
const HOUR_MS = 60 * 60 * 1000

function schedule(over: Partial<BackupScheduleRow> = {}): BackupScheduleRow {
  return {
    id: 1,
    targetId: '00000000-0000-4000-8000-000000000001',
    frequency: 'daily',
    startHour: 1,
    keepCount: 14,
    scheduledSince: new Date('2027-03-01T12:00:00Z'),
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
    updatedAt: new Date('2027-03-01T12:00:00Z'),
    ...over,
  }
}

describe('firstSlotAtOrAfter', () => {
  it('finds the next start hour in the town time zone', () => {
    expect(firstSlotAtOrAfter(new Date('2027-03-01T12:00:00Z'), 1, ZONE)).toEqual(
      new Date('2027-03-02T06:00:00Z'),
    )
  })

  it('returns the instant itself when it is on the start hour', () => {
    const at = new Date('2027-03-02T06:00:00Z')
    expect(firstSlotAtOrAfter(at, 1, ZONE)).toEqual(at)
  })

  it('keeps the local hour across the change to daylight saving time', () => {
    expect(firstSlotAtOrAfter(new Date('2027-03-14T12:00:00Z'), 1, ZONE)).toEqual(
      new Date('2027-03-15T05:00:00Z'),
    )
  })
})

describe('advanceDue', () => {
  it('moves a daily backup to the same local hour the next day', () => {
    const due = new Date('2027-03-02T06:00:00Z')
    const now = new Date('2027-03-02T06:20:00Z')
    expect(advanceDue(due, schedule(), ZONE, now)).toEqual(new Date('2027-03-03T06:00:00Z'))
  })

  it('moves a weekly backup a week ahead', () => {
    const due = new Date('2027-03-02T06:00:00Z')
    const now = new Date('2027-03-02T06:20:00Z')
    expect(advanceDue(due, schedule({ frequency: 'weekly' }), ZONE, now)).toEqual(
      new Date('2027-03-09T06:00:00Z'),
    )
  })

  it('skips the slots that passed while nothing ran', () => {
    const due = new Date('2027-03-02T06:00:00Z')
    const now = new Date('2027-03-05T09:00:00Z')
    expect(advanceDue(due, schedule(), ZONE, now)).toEqual(new Date('2027-03-06T06:00:00Z'))
  })

  it('leaves a due time that is still ahead alone', () => {
    const due = new Date('2027-03-03T06:00:00Z')
    const now = new Date('2027-03-02T15:00:00Z')
    expect(advanceDue(due, schedule(), ZONE, now)).toEqual(due)
  })
})

describe('isBackupDue', () => {
  const due = new Date('2027-03-02T06:00:00Z')

  it('is never due without a target', () => {
    const off = schedule({ targetId: null, runRequestedAt: due })
    expect(isBackupDue(off, new Date('2027-03-09T00:00:00Z'))).toBe(false)
  })

  it('is due once the due time has passed', () => {
    expect(isBackupDue(schedule(), new Date(due.getTime() - 1))).toBe(false)
    expect(isBackupDue(schedule(), due)).toBe(true)
  })

  it('is due at once when someone asked for a backup', () => {
    const asked = schedule({ runRequestedAt: new Date('2027-03-01T13:00:00Z') })
    expect(isBackupDue(asked, new Date('2027-03-01T13:01:00Z'))).toBe(true)
  })

  it('waits before trying again after a failure or a skip', () => {
    const failedAt = new Date(due.getTime() + 5 * 60 * 1000)
    const failed = schedule({ lastFailureAt: failedAt, lastFailureKind: 'failed' })
    expect(isBackupDue(failed, new Date(failedAt.getTime() + HOUR_MS))).toBe(false)
    expect(isBackupDue(failed, new Date(failedAt.getTime() + RETRY_AFTER_FAILURE_MS))).toBe(true)
  })
})

describe('nextBackupAt', () => {
  it('is null when backups are off', () => {
    expect(nextBackupAt(schedule({ targetId: null }), new Date())).toBeNull()
  })

  it('is the due time, or the retry time after a failure', () => {
    expect(nextBackupAt(schedule(), new Date('2027-03-01T13:00:00Z'))).toEqual(
      new Date('2027-03-02T06:00:00Z'),
    )
    const failedAt = new Date('2027-03-02T06:05:00Z')
    expect(
      nextBackupAt(
        schedule({ lastFailureAt: failedAt, lastFailureKind: 'failed' }),
        new Date('2027-03-02T07:00:00Z'),
      ),
    ).toEqual(new Date(failedAt.getTime() + RETRY_AFTER_FAILURE_MS))
  })

  it('is now when a backup was asked for', () => {
    const now = new Date('2027-03-01T13:00:00Z')
    expect(nextBackupAt(schedule({ runRequestedAt: now }), now)).toEqual(now)
  })
})
