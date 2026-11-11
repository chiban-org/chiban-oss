import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import { createS3Target } from '@/features/export/targets/s3Target'
import type { StorageTarget } from '@/features/export/targets/types'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal

async function putText(target: StorageTarget, path: string, text: string) {
  const bytes = Buffer.from(text)
  const put = await target.put(path, Readable.from([bytes]), bytes.length, signal)
  if (!put.ok) throw new Error(put.error.detail)
}

describe('local filesystem target listing and deleting', () => {
  it('lists the files directly inside a folder, not deeper ones or folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chiban-target-'))
    const target = createLocalFsTarget({ root })
    await putText(target, 'backups/a.bin', 'a')
    await putText(target, 'backups/b.bin', 'b')
    await putText(target, 'backups/nested/c.bin', 'c')
    const listed = await target.list('backups', signal)
    expect(listed.ok ? [...listed.value].sort() : listed).toEqual(['a.bin', 'b.bin'])
  })

  it('lists a folder that does not exist as empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chiban-target-'))
    expect(await createLocalFsTarget({ root }).list('backups', signal)).toEqual({
      ok: true,
      value: [],
    })
  })

  it('deletes one file and treats a missing file as already deleted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chiban-target-'))
    const target = createLocalFsTarget({ root })
    await putText(target, 'backups/a.bin', 'a')
    await putText(target, 'backups/b.bin', 'b')
    expect(await target.delete('backups/a.bin', signal)).toEqual({ ok: true, value: undefined })
    expect(await target.delete('backups/a.bin', signal)).toEqual({ ok: true, value: undefined })
    expect(await readdir(join(root, 'backups'))).toEqual(['b.bin'])
  })

  it('refuses to list or delete outside the target folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chiban-target-'))
    const outside = await mkdtemp(join(tmpdir(), 'chiban-outside-'))
    await writeFile(join(outside, 'keep.bin'), 'x')
    const target = createLocalFsTarget({ root })
    expect(await target.list('..', signal)).toMatchObject({
      ok: false,
      error: { kind: 'bad_shape' },
    })
    expect(
      await target.delete(`../${outside.split('/').pop() ?? ''}/keep.bin`, signal),
    ).toMatchObject({ ok: false, error: { kind: 'bad_shape' } })
    expect(await readdir(outside)).toEqual(['keep.bin'])
  })

  it('does not delete a folder', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chiban-target-'))
    await mkdir(join(root, 'backups', 'inner'), { recursive: true })
    const target = createLocalFsTarget({ root })
    expect(await target.delete('backups/inner', signal)).toMatchObject({ ok: false })
    expect(await readdir(join(root, 'backups'))).toEqual(['inner'])
  })
})

describe('s3 target listing and deleting', () => {
  it('lists names under its own prefix only and deletes one object', async () => {
    const { store, config } = await makeTestStore()
    const target = createS3Target(
      { endpoint: config.endpoint, bucket: config.bucket, prefix: 'town/', region: config.region },
      { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    )
    await putText(target, 'backups/a.bin', 'a')
    await putText(target, 'backups/b.bin', 'b')
    await putText(target, 'backups/nested/c.bin', 'c')
    await store.upload('other/backups/z.bin', Readable.from([Buffer.from('z')]), 'x', signal)
    const listed = await target.list('backups', signal)
    expect(listed.ok ? [...listed.value].sort() : listed).toEqual(['a.bin', 'b.bin'])
    expect(await target.delete('backups/a.bin', signal)).toEqual({ ok: true, value: undefined })
    expect(await target.delete('backups/a.bin', signal)).toEqual({ ok: true, value: undefined })
    expect((await store.list('', signal)).sort()).toEqual([
      'other/backups/z.bin',
      'town/backups/b.bin',
      'town/backups/nested/c.bin',
    ])
  })

  it('reports an unreachable endpoint when listing', async () => {
    const { config } = await makeTestStore()
    const target = createS3Target(
      { endpoint: 'http://127.0.0.1:1', bucket: config.bucket, prefix: '', region: config.region },
      { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    )
    expect(await target.list('backups', signal)).toMatchObject({
      ok: false,
      error: { kind: 'unreachable' },
    })
  })
})
