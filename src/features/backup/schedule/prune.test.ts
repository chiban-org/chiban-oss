import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import type { StorageTarget } from '@/features/export/targets/types'
import { err } from '@/types/result'
import { pruneBackups } from './prune'

const signal = new AbortController().signal

async function folderWith(names: string[]): Promise<{ root: string; target: StorageTarget }> {
  const root = await mkdtemp(join(tmpdir(), 'chiban-prune-'))
  const target = createLocalFsTarget({ root })
  for (const name of names) {
    const put = await target.put(`backups/${name}`, Readable.from([Buffer.from('x')]), 1, signal)
    if (!put.ok) throw new Error(put.error.detail)
  }
  return { root, target }
}

const days = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => {
    return `chiban-backup-2027-03-${String(from + i).padStart(2, '0')}.bin`
  })

describe('pruneBackups', () => {
  it('keeps the newest backups and deletes the older ones', async () => {
    const { root, target } = await folderWith(days(1, 6))
    const pruned = await pruneBackups(target, 3, 'backups/chiban-backup-2027-03-06.bin', signal)
    expect(pruned).toEqual({ ok: true, value: { deleted: days(1, 3).reverse() } })
    expect((await readdir(join(root, 'backups'))).sort()).toEqual(days(4, 6))
  })

  it('leaves other files in the folder alone, including a write in progress', async () => {
    const { root, target } = await folderWith(days(1, 3))
    await writeFile(join(root, 'backups', 'notes.txt'), 'keep me')
    await writeFile(join(root, 'backups', 'chiban-backup-2027-03-04.bin.1234.partial'), 'x')
    await writeFile(join(root, 'backups', 'chiban-backup-latest.bin'), 'x')
    await pruneBackups(target, 1, 'backups/chiban-backup-2027-03-03.bin', signal)
    expect((await readdir(join(root, 'backups'))).sort()).toEqual([
      'chiban-backup-2027-03-03.bin',
      'chiban-backup-2027-03-04.bin.1234.partial',
      'chiban-backup-latest.bin',
      'notes.txt',
    ])
  })

  it('never deletes the backup just written, even when its date sorts older', async () => {
    const { root, target } = await folderWith(['chiban-backup-2027-01-01.bin', ...days(1, 3)])
    await pruneBackups(target, 2, 'backups/chiban-backup-2027-01-01.bin', signal)
    expect((await readdir(join(root, 'backups'))).sort()).toEqual([
      'chiban-backup-2027-01-01.bin',
      'chiban-backup-2027-03-03.bin',
    ])
  })

  it('reports the first delete that fails', async () => {
    const { target } = await folderWith(days(1, 3))
    const failing: StorageTarget = {
      ...target,
      delete: () => Promise.resolve(err({ kind: 'denied', detail: 'read only' })),
    }
    expect(await pruneBackups(failing, 1, 'backups/chiban-backup-2027-03-03.bin', signal)).toEqual({
      ok: false,
      error: { kind: 'denied', detail: 'read only' },
    })
  })
})
