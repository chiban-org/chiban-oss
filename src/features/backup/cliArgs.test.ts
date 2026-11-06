import { describe, expect, it } from 'vitest'
import {
  parseBackupArgs,
  parseRestoreObjectsArgs,
  parseVerifyArgs,
} from '@/features/backup/cliArgs'

describe('backup arguments', () => {
  it('accepts a directory', () => {
    expect(parseBackupArgs(['--dir', '/backups'])).toEqual({
      ok: true,
      value: { kind: 'dir', dir: '/backups' },
    })
  })

  it('accepts a configured target name', () => {
    expect(parseBackupArgs(['--target', 'Town bucket'])).toEqual({
      ok: true,
      value: { kind: 'target', name: 'Town bucket' },
    })
  })

  it('needs exactly one of the two', () => {
    expect(parseBackupArgs([]).ok).toBe(false)
    expect(parseBackupArgs(['--dir', '/a', '--target', 'b']).ok).toBe(false)
  })

  it('rejects an empty value and unknown flags', () => {
    expect(parseBackupArgs(['--dir', '']).ok).toBe(false)
    expect(parseBackupArgs(['--dir', '/a', '--other']).ok).toBe(false)
  })
})

describe('restore verify arguments', () => {
  it('needs a file and reads the keep flag', () => {
    expect(parseVerifyArgs(['--file', 'b.bin'])).toEqual({
      ok: true,
      value: { file: 'b.bin', keep: false },
    })
    expect(parseVerifyArgs(['--file', 'b.bin', '--keep'])).toEqual({
      ok: true,
      value: { file: 'b.bin', keep: true },
    })
    expect(parseVerifyArgs([]).ok).toBe(false)
    expect(parseVerifyArgs(['--keep']).ok).toBe(false)
    expect(parseVerifyArgs(['--file', 'b.bin', '--nope']).ok).toBe(false)
  })
})

describe('restore objects arguments', () => {
  it('requires a folder and nothing else', () => {
    expect(parseRestoreObjectsArgs(['--dir', '/objects'])).toEqual({
      ok: true,
      value: { dir: '/objects' },
    })
    expect(parseRestoreObjectsArgs([]).ok).toBe(false)
    expect(parseRestoreObjectsArgs(['--dir', '']).ok).toBe(false)
    expect(parseRestoreObjectsArgs(['--dir', '/objects', '--nope']).ok).toBe(false)
  })
})
