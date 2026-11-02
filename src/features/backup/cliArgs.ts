import { parseArgs } from 'node:util'
import { err, ok, type Result } from '@/types/result'

export type BackupArgs = { kind: 'dir'; dir: string } | { kind: 'target'; name: string }

export interface VerifyArgs {
  file: string
  keep: boolean
}

export const BACKUP_USAGE = 'usage: backup (--dir <folder> | --target <export target name>)'
export const VERIFY_USAGE = 'usage: restore-verify --file <backup.bin> [--keep]'

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
