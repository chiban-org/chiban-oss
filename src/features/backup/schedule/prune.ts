import { BACKUP_FILE_NAME, BACKUP_FOLDER } from '@/features/backup/createBackup'
import type { StorageTarget, TargetError } from '@/features/export/targets/types'
import { ok, type Result } from '@/types/result'

export async function pruneBackups(
  target: StorageTarget,
  keep: number,
  justWritten: string,
  signal: AbortSignal,
): Promise<Result<{ deleted: string[] }, TargetError>> {
  const listed = await target.list(BACKUP_FOLDER, signal)
  if (!listed.ok) return listed
  const written = justWritten.slice(BACKUP_FOLDER.length + 1)
  const older = listed.value
    .filter((name) => BACKUP_FILE_NAME.test(name) && name !== written)
    .sort()
    .reverse()
    .slice(Math.max(keep - 1, 0))
  const deleted: string[] = []
  for (const name of older) {
    const removed = await target.delete(`${BACKUP_FOLDER}/${name}`, signal)
    if (!removed.ok) return removed
    deleted.push(name)
  }
  return ok({ deleted })
}
