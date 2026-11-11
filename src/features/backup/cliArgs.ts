import { parseArgs } from 'node:util'
import { exportFolderSchema } from '@/features/export/exportIndex'
import { err, ok, type Result } from '@/types/result'

export type BackupArgs = { kind: 'dir'; dir: string } | { kind: 'target'; name: string }

export interface VerifyArgs {
  file: string
  keep: boolean
}

export const BACKUP_USAGE = 'usage: backup (--dir <folder> | --target <export target name>)'
export const VERIFY_USAGE = 'usage: restore-verify --file <backup.bin> [--keep]'
export const RESTORE_OBJECTS_USAGE = 'usage: restore-objects --dir <folder>'
export const IMPORT_FROM_TARGET_USAGE =
  'usage: import-from-target --dir <folder holding chiban-export> --month <export folder, e.g. 2027-02>'

function parse<T extends Record<string, { type: 'string' | 'boolean' }>>(
  argv: string[],
  options: T,
) {
  try {
    return parseArgs({ args: argv, options, strict: true, allowPositionals: false }).values
  } catch {
    return null
  }
}

export function parseBackupArgs(argv: string[]): Result<BackupArgs, string> {
  const values = parse(argv, { dir: { type: 'string' }, target: { type: 'string' } } as const)
  if (values === null) return err(BACKUP_USAGE)
  const dir = values.dir ?? ''
  const name = values.target ?? ''
  if ((dir === '') === (name === '')) return err(BACKUP_USAGE)
  return ok(dir === '' ? { kind: 'target', name } : { kind: 'dir', dir })
}

export function parseVerifyArgs(argv: string[]): Result<VerifyArgs, string> {
  const values = parse(argv, { file: { type: 'string' }, keep: { type: 'boolean' } } as const)
  if (values === null || (values.file ?? '') === '') return err(VERIFY_USAGE)
  return ok({ file: values.file ?? '', keep: values.keep === true })
}

export function parseRestoreObjectsArgs(argv: string[]): Result<{ dir: string }, string> {
  const values = parse(argv, { dir: { type: 'string' } } as const)
  if (values === null || (values.dir ?? '') === '') return err(RESTORE_OBJECTS_USAGE)
  return ok({ dir: values.dir ?? '' })
}

export function parseImportFromTargetArgs(
  argv: string[],
): Result<{ dir: string; month: string }, string> {
  const values = parse(argv, { dir: { type: 'string' }, month: { type: 'string' } } as const)
  const dir = values?.dir ?? ''
  const month = values?.month ?? ''
  if (dir === '' || !exportFolderSchema.safeParse(month).success)
    return err(IMPORT_FROM_TARGET_USAGE)
  return ok({ dir, month })
}
