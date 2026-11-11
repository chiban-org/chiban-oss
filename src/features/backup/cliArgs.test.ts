import { describe, expect, it } from 'vitest'
import {
  parseBackupArgs,
  parseImportFromTargetArgs,
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

describe('import from target arguments', () => {
  it('needs the copy folder and the export folder to restore', () => {
    expect(parseImportFromTargetArgs(['--dir', '/copies', '--month', '2027-01-3'])).toEqual({
      ok: true,
      value: { dir: '/copies', month: '2027-01-3' },
    })
    expect(parseImportFromTargetArgs(['--dir', '/copies']).ok).toBe(false)
    expect(parseImportFromTargetArgs(['--month', '2027-02']).ok).toBe(false)
    expect(parseImportFromTargetArgs(['--dir', '', '--month', '2027-02']).ok).toBe(false)
    expect(parseImportFromTargetArgs(['--dir', '/c', '--month', '2027-02', '--x']).ok).toBe(false)
  })

  it('refuses an export folder that would leave the copy folder', () => {
    for (const month of ['../2027-02', '2027-02/..', '/etc', 'a/b']) {
      expect(parseImportFromTargetArgs(['--dir', '/copies', '--month', month]).ok, month).toBe(
        false,
      )
    }
  })
})
