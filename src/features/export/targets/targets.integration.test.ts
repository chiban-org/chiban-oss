import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readAll } from '@/features/export/readArchive'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import { createS3Target } from '@/features/export/targets/s3Target'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal

async function freshRoot(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'chiban-target-'))
}

function failingBody(): Readable {
  let sent = false
  return new Readable({
    read() {
      if (!sent) {
        sent = true
        this.push(Buffer.from('first half'))
        return
      }
      this.destroy(new Error('connection lost'))
    },
  })
}

describe('local filesystem target', () => {
  it('local target refuses ../outside', async () => {
    const root = await freshRoot()
    const target = createLocalFsTarget({ root })
    const body = Readable.from([Buffer.from('x')])
    const put = await target.put('../outside.txt', body, 1, signal)
    expect(put).toMatchObject({ ok: false, error: { kind: 'bad_shape' } })
    const absolute = await target.put(
      '/etc/outside.txt',
      Readable.from([Buffer.from('x')]),
      1,
      signal,
    )
    expect(absolute).toMatchObject({ ok: false, error: { kind: 'bad_shape' } })
    const exists = await target.exists('../outside.txt', signal)
    expect(exists).toMatchObject({ ok: false, error: { kind: 'bad_shape' } })
    const get = await target.get('a/../../outside.txt', signal)
    expect(get).toMatchObject({ ok: false, error: { kind: 'bad_shape' } })
  })

  it('local target writes nested files and reads them back', async () => {
    const root = await freshRoot()
    const target = createLocalFsTarget({ root })
    const bytes = Buffer.from('hello town')
    const put = await target.put(
      'chiban-export/2026-11/data/a.ndjson',
      Readable.from([bytes]),
      bytes.length,
      signal,
    )
    expect(put.ok).toBe(true)
    expect(await target.exists('chiban-export/2026-11/data/a.ndjson', signal)).toEqual({
      ok: true,
      value: true,
    })
    expect(await target.exists('chiban-export/2026-11/data/b.ndjson', signal)).toEqual({
      ok: true,
      value: false,
    })
    const got = await target.get('chiban-export/2026-11/data/a.ndjson', signal)
    if (!got.ok) throw new Error('missing')
    expect((await readAll(got.value, 1024)).toString()).toBe('hello town')
    expect(await target.get('chiban-export/none', signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('local target never leaves a partial file after a failed write', async () => {
    const root = await freshRoot()
    const target = createLocalFsTarget({ root })
    const put = await target.put('chiban-export/2026-11/manifest.json', failingBody(), 100, signal)
    expect(put.ok).toBe(false)
    const left = await readdir(root, { recursive: true, withFileTypes: true })
    expect(left.filter((e) => e.isFile())).toEqual([])
    expect(await target.exists('chiban-export/2026-11/manifest.json', signal)).toEqual({
      ok: true,
      value: false,
    })
  })

  it('local target replaces an existing file whole', async () => {
    const root = await freshRoot()
    const target = createLocalFsTarget({ root })
    await target.put('a.json', Readable.from([Buffer.from('old old old')]), 11, signal)
    await target.put('a.json', Readable.from([Buffer.from('new')]), 3, signal)
    expect((await readFile(join(root, 'a.json'))).toString()).toBe('new')
  })
})

describe('s3 target', () => {
  it('s3 target writes to a second object store bucket', async () => {
    const { store: source } = await makeTestStore()
    const { store: second, config } = await makeTestStore()
    const target = createS3Target(
      {
        endpoint: config.endpoint,
        bucket: config.bucket,
        prefix: 'town-copy/',
        region: config.region,
      },
      { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    )
    const bytes = Buffer.from(`copy ${randomUUID()}`)
    const put = await target.put(
      'chiban-export/files/x',
      Readable.from([bytes]),
      bytes.length,
      signal,
    )
    expect(put.ok).toBe(true)
    expect(await second.list('town-copy/', signal)).toEqual(['town-copy/chiban-export/files/x'])
    expect(await source.list('town-copy/', signal)).toEqual([])
    expect(await target.exists('chiban-export/files/x', signal)).toEqual({ ok: true, value: true })
    expect(await target.exists('chiban-export/files/y', signal)).toEqual({ ok: true, value: false })
    const got = await target.get('chiban-export/files/x', signal)
    if (!got.ok) throw new Error('missing')
    expect((await readAll(got.value, 1024)).toString()).toBe(bytes.toString())
    expect(await target.get('chiban-export/files/y', signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('s3 target reports an unreachable endpoint', async () => {
    const { config } = await makeTestStore()
    const target = createS3Target(
      { endpoint: 'http://127.0.0.1:1', bucket: config.bucket, prefix: '', region: config.region },
      { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    )
    const put = await target.put('x', Readable.from([Buffer.from('x')]), 1, signal)
    expect(put).toMatchObject({ ok: false, error: { kind: 'unreachable' } })
  })
})
