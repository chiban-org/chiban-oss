import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { restoreObjectsFromDir } from '@/features/backup/restoreObjects'
import { makeTestStore } from '@/test/objectStore'

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text()
}

describe('restoreObjectsFromDir', () => {
  it('uploads every file under the folder with its relative path as the key', async () => {
    const { store } = await makeTestStore()
    const signal = AbortSignal.timeout(20_000)
    const dir = await mkdtemp(path.join(tmpdir(), 'chiban-restore-objects-'))
    await mkdir(path.join(dir, 'blobs', 'ab'), { recursive: true })
    await writeFile(path.join(dir, 'blobs', 'ab', 'abcdef'), 'first')
    await writeFile(path.join(dir, 'top.txt'), 'second')

    expect(await restoreObjectsFromDir(store, dir, signal)).toBe(2)

    expect((await store.list('', signal)).sort()).toEqual(['blobs/ab/abcdef', 'top.txt'])
    const body = await store.getStream('blobs/ab/abcdef', signal)
    expect(body.ok && (await readAll(body.value))).toBe('first')
  })

  it('an empty folder uploads nothing', async () => {
    const { store } = await makeTestStore()
    const dir = await mkdtemp(path.join(tmpdir(), 'chiban-restore-objects-'))
    expect(await restoreObjectsFromDir(store, dir, AbortSignal.timeout(10_000))).toBe(0)
  })
})
