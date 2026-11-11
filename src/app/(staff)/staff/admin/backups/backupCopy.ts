import type { BackupScheduleRow } from '@/db/schema'

const NOON = 12
const BYTES_PER_MB = 1_000_000
const BYTES_PER_KB = 1000

export const FREQUENCY_COPY: Record<BackupScheduleRow['frequency'], string> = {
  daily: 'every day',
  weekly: 'every week',
}

export const PROBLEM_COPY: Record<NonNullable<BackupScheduleRow['lastFailureKind']>, string> = {
  failed: 'Last backup failed',
  skipped: 'Last backup did not run',
}

export function hourLabel(hour: number): string {
  const twelve = hour % NOON === 0 ? NOON : hour % NOON
  return `${twelve}:00 ${hour < NOON ? 'AM' : 'PM'}`
}

export function sizeLabel(bytes: number): string {
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`
  if (bytes >= BYTES_PER_KB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`
  return `${bytes} bytes`
}
