import type { BackupScheduleRow } from '@/db/schema'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const SEARCH_HOURS = 48
const SLOT_SLACK_MS = 3 * HOUR_MS

export const RETRY_AFTER_FAILURE_MS = 6 * HOUR_MS

export const FREQUENCY_MS: Record<BackupScheduleRow['frequency'], number> = {
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
}

type Timing = Pick<BackupScheduleRow, 'frequency' | 'startHour'>

function zoneHour(instant: Date, zone: string): number {
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(instant)
  return Number(text)
}

export function firstSlotAtOrAfter(from: Date, hour: number, zone: string): Date {
  const start = Math.ceil(from.getTime() / HOUR_MS) * HOUR_MS
  for (let step = 0; step < SEARCH_HOURS; step++) {
    const candidate = new Date(start + step * HOUR_MS)
    if (zoneHour(candidate, zone) === hour) return candidate
  }
  return new Date(start)
}

export function advanceDue(due: Date, timing: Timing, zone: string, now: Date): Date {
  let next = due
  while (next.getTime() <= now.getTime()) {
    const earliest = new Date(next.getTime() + FREQUENCY_MS[timing.frequency] - SLOT_SLACK_MS)
    next = firstSlotAtOrAfter(earliest, timing.startHour, zone)
  }
  return next
}

function retryAt(row: BackupScheduleRow): Date | null {
  if (row.lastFailureAt === null || row.nextDueAt === null) return null
  if (row.lastFailureAt.getTime() < row.nextDueAt.getTime()) return null
  return new Date(row.lastFailureAt.getTime() + RETRY_AFTER_FAILURE_MS)
}

export function nextBackupAt(row: BackupScheduleRow, now: Date): Date | null {
  if (row.targetId === null) return null
  if (row.runRequestedAt !== null) return now
  if (row.nextDueAt === null) return null
  return retryAt(row) ?? row.nextDueAt
}

export function isBackupDue(row: BackupScheduleRow, now: Date): boolean {
  const next = nextBackupAt(row, now)
  return next !== null && next.getTime() <= now.getTime()
}
