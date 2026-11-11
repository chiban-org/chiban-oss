import type { BackupError } from '@/features/backup/createBackup'

export const NO_PASSPHRASE =
  'BACKUP_PASSPHRASE is not set on the server, so no backup was made. Whoever runs the server needs to set it and restart the worker.'

export const TIMED_OUT = 'The backup was stopped because it ran longer than the time allowed.'

export function unexpectedFailure(e: unknown): string {
  return `The backup stopped with an unexpected error: ${e instanceof Error ? e.message : String(e)}`
}

export const TARGET_GONE = 'The storage chosen for backups no longer exists. Choose another one.'

export function unusableTarget(name: string, problem: 'bad_settings' | 'bad_credentials'): string {
  const what = problem === 'bad_settings' ? 'settings' : 'credentials'
  return `The storage ${what} for ${name} cannot be used. Check them under Copy exports to your own storage.`
}

const FIXED = new Map<Exclude<BackupError, object>, string>([
  ['passphrase_too_short', 'BACKUP_PASSPHRASE on the server is shorter than 16 characters.'],
  ['dump_failed', 'The database could not be copied (pg_dump failed).'],
  ['object_unreadable', 'A stored file could not be read while the backup was written.'],
])

export function describeBackupError(error: BackupError): string {
  if (typeof error === 'string') return FIXED.get(error) ?? error
  if ('missingObjects' in error) {
    const count = error.missingObjects.length
    const files =
      count === 1
        ? '1 stored file that records point to is'
        : `${count} stored files that records point to are`
    return `${files} missing from file storage, so no backup was made.`
  }
  return `The storage did not accept the backup: ${error.detail}`
}
