import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportsTable, exportTargets, files } from '@/db/schema'
import { compareTowns } from '@/features/export/compareTowns'
import { EXPORT_ENTITIES } from '@/features/export/entities'
import { importFromTarget } from '@/features/export/importFromTarget'
import { runIncremental } from '@/features/export/incremental'
import { manifestSchema } from '@/features/export/manifest'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import type { StorageTarget } from '@/features/export/targets/types'
import { getObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { makeParcel, seedFormats, seedTown } from '@/test/parcels'
import { err } from '@/types/result'

const signal = new AbortController().signal
const store = getObjectStore()
const NOV = new Date('2026-11-02T15:00:00Z')
const DEC = new Date('2026-12-02T15:00:00Z')
const JAN = new Date('2027-01-04T15:00:00Z')
const FEB = new Date('2027-02-03T15:00:00Z')

let handle: TestDb
let root: string
let local: StorageTarget
let targetId: string

interface Recorder {
  target: StorageTarget
  puts: string[]
  failOn: string | null
}

function recording(inner: StorageTarget): Recorder {
  const rec: Recorder = { target: inner, puts: [], failOn: null }
  rec.target = {
    kind: inner.kind,
    exists: (p, s) => inner.exists(p, s),
    get: (p, s) => inner.get(p, s),
    async put(path, body, size, s) {
      if (rec.failOn !== null && path.endsWith(rec.failOn)) {
        body.destroy()
        return err({ kind: 'unreachable', detail: 'injected failure' })
      }
      rec.puts.push(path)
      return await inner.put(path, body, size, s)
    },
  }
  return rec
}

async function addBlob(text: string): Promise<string> {
  const bytes = Buffer.from(text)
  const sha = createHash('sha256').update(bytes).digest('hex')
  const key = `blobs/sha256/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`
  await store.putBytes(key, bytes, 'text/plain', signal)
  await handle.db
    .insert(files)
    .values({ sha256: sha, sizeBytes: bytes.length, contentType: 'text/plain', storageKey: key })
  return sha
}

async function run(rec: Recorder, now: Date) {
  rec.puts.length = 0
  return await runIncremental(handle.db, store, rec.target, targetId, now, signal)
}

const dataPuts = (puts: string[]) => puts.filter((p) => p.includes('/data/'))
const filePuts = (puts: string[]) => puts.filter((p) => p.includes('/files/'))

async function readIndexFile(): Promise<{ exportId: string; folder: string }[]> {
  const text = await readFile(join(root, 'chiban-export/exports.json'), 'utf8')
  return (JSON.parse(text) as { exports: { exportId: string; folder: string }[] }).exports
}

async function tree(): Promise<string[]> {
  const all = await readdir(root, { recursive: true, withFileTypes: true })
  return all.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name).slice(root.length + 1))
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedFormats(handle.db)
  await seedTown(handle.db)
  await makeParcel(handle.db, [])
  await makeParcel(handle.db, [])
  await addBlob('first document bytes')
  root = await mkdtemp(join(tmpdir(), 'chiban-incremental-'))
  local = createLocalFsTarget({ root })
  const [row] = await handle.db
    .insert(exportTargets)
    .values({ kind: 'local_fs', name: 'Town server', settings: { root }, dayOfMonth: 2 })
    .returning({ id: exportTargets.id })
  targetId = row?.id ?? ''
}, 120_000)
afterAll(async () => {
  await handle.drop()
})

describe('incremental export', () => {
  const rec = () => recorder
  let recorder: Recorder
  beforeAll(() => {
    recorder = recording(local)
  })

  it('first incremental is a full layout', async () => {
    const result = await run(rec(), NOV)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    const paths = await tree()
    expect(paths).toContain('chiban-export/2026-11/manifest.json')
    expect(paths).toContain('chiban-export/2026-11/manifest.sha256')
    expect(paths).toContain('chiban-export/2026-11/FORMAT.md')
    expect(paths).toContain('chiban-export/exports.json')
    expect(paths.filter((p) => p.startsWith('chiban-export/2026-11/data/'))).toHaveLength(
      EXPORT_ENTITIES.length,
    )
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(join(root, 'chiban-export/2026-11/manifest.json'), 'utf8')),
    )
    expect(manifest.kind).toBe('incremental')
    expect(manifest.baseExportId).toBeNull()
    for (const file of manifest.files) expect(paths).toContain(`chiban-export/${file.path}`)
    expect(manifest.files).toHaveLength(1)
    if (result.ok) {
      expect(result.value.entitiesWritten).toBe(EXPORT_ENTITIES.length)
      expect(result.value.filesWritten).toBe(1)
    }
    const [row] = await handle.db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.targetId, targetId))
    expect(row).toMatchObject({ kind: 'incremental', status: 'ready', baseExportId: null })
    const [target] = await handle.db.select().from(exportTargets)
    expect(target?.lastSuccessAt).not.toBeNull()
    expect(target?.lastError).toBeNull()
  })

  it('second incremental after one new parcel writes the parcels entity and nothing else', async () => {
    await makeParcel(handle.db, [])
    const result = await run(rec(), DEC)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect(dataPuts(rec().puts)).toEqual(['chiban-export/2026-12/data/parcels.ndjson'])
    expect(filePuts(rec().puts)).toEqual([])
    if (result.ok) expect(result.value).toMatchObject({ entitiesWritten: 1, filesWritten: 0 })
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(join(root, 'chiban-export/2026-12/manifest.json'), 'utf8')),
    )
    expect(manifest.baseExportId).not.toBeNull()
  })

  it('a new document writes its file once into the shared files folder', async () => {
    const sha = await addBlob('second document bytes')
    const result = await run(rec(), JAN)
    expect(result.ok, JSON.stringify(result)).toBe(true)
    const expected = `chiban-export/files/sha256/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`
    expect(filePuts(rec().puts)).toEqual([expected])
    expect(await tree()).toContain(expected)
    expect((await tree()).filter((p) => p.endsWith(sha))).toHaveLength(1)
    expect(dataPuts(rec().puts)).toEqual(['chiban-export/2027-01/data/files.ndjson'])
    const again = await run(rec(), new Date('2027-01-20T15:00:00Z'))
    expect(again.ok).toBe(true)
    expect(filePuts(rec().puts)).toEqual([])
    expect(dataPuts(rec().puts)).toEqual([])
  })

  it('manifest is written last', async () => {
    await makeParcel(handle.db, [])
    const ok = await run(rec(), new Date('2027-01-21T15:00:00Z'))
    expect(ok.ok).toBe(true)
    const tail = rec().puts.slice(-4)
    expect(tail).toEqual([
      'chiban-export/2027-01-3/FORMAT.md',
      'chiban-export/2027-01-3/manifest.sha256',
      'chiban-export/2027-01-3/manifest.json',
      'chiban-export/exports.json',
    ])
    expect(rec().puts.filter((p) => p.includes('/data/') || p.includes('/files/'))).toEqual([
      'chiban-export/2027-01-3/data/parcels.ndjson',
    ])
  })

  it('a target that fails on the manifest put leaves the previous month as the latest complete one', async () => {
    await makeParcel(handle.db, [])
    const failing = recording(local)
    failing.failOn = '2027-02/manifest.json'
    const result = await runIncremental(handle.db, store, failing.target, targetId, FEB, signal)
    expect(result).toMatchObject({ ok: false, error: { kind: 'unreachable' } })
    const paths = await tree()
    expect(paths).not.toContain('chiban-export/2027-02/manifest.json')
    expect(paths).toContain('chiban-export/2027-01-3/manifest.json')
    const index = await readIndexFile()
    expect(index.map((e) => e.folder)).not.toContain('2027-02')
    const rows = await handle.db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.targetId, targetId))
    expect(rows.filter((r) => r.status === 'failed')).toHaveLength(1)
    const [target] = await handle.db.select().from(exportTargets)
    expect(target?.lastFailureAt).not.toBeNull()
    expect(target?.lastError).toContain('injected failure')
    const retry = await run(rec(), FEB)
    expect(retry.ok).toBe(true)
    const manifest = manifestSchema.parse(
      JSON.parse(await readFile(join(root, 'chiban-export/2027-02/manifest.json'), 'utf8')),
    )
    const january = manifestSchema.parse(
      JSON.parse(await readFile(join(root, 'chiban-export/2027-01-3/manifest.json'), 'utf8')),
    )
    expect(manifest.baseExportId).toBe(january.exportId)
  })

  it('the index maps each export to its folder and a second export in a month gets its own folder', async () => {
    const index = await readIndexFile()
    const folders = index.map((e) => e.folder)
    expect(folders).toEqual(['2026-11', '2026-12', '2027-01', '2027-01-2', '2027-01-3', '2027-02'])
    const january = manifestSchema.parse(
      JSON.parse(await readFile(join(root, 'chiban-export/2027-01-3/manifest.json'), 'utf8')),
    )
    expect(index).toContainEqual({ exportId: january.exportId, folder: '2027-01-3' })
  })

  it('restore from base plus one incremental equals the source town', async () => {
    const restored = await makeTestDb()
    const { store: freshStore } = await makeTestStore()
    try {
      const result = await importFromTarget(restored.db, freshStore, local, '2027-02', signal)
      expect(result.ok, JSON.stringify(result)).toBe(true)
      const diffs = await compareTowns(handle.db, restored.db, signal)
      expect(diffs.filter((d) => d.onlyInA + d.onlyInB + d.differing > 0)).toEqual([])
      const rows = await restored.db.select().from(files)
      expect(rows).toHaveLength(2)
      for (const row of rows) expect((await freshStore.head(row.storageKey, signal)).ok).toBe(true)
    } finally {
      await restored.drop()
    }
  }, 120_000)

  it('restore of a month that was never written says so', async () => {
    const restored = await makeTestDb()
    const { store: freshStore } = await makeTestStore()
    try {
      const result = await importFromTarget(restored.db, freshStore, local, '2030-01', signal)
      expect(result).toEqual({ ok: false, error: 'month_not_found' })
    } finally {
      await restored.drop()
    }
  })

  it('restore reports a manifest that points at an export the index does not know', async () => {
    const restored = await makeTestDb()
    const { store: freshStore } = await makeTestStore()
    const other = await mkdtemp(join(tmpdir(), 'chiban-incremental-copy-'))
    try {
      const { cp, writeFile } = await import('node:fs/promises')
      await cp(root, other, { recursive: true })
      await writeFile(join(other, 'chiban-export/exports.json'), '{"version":1,"exports":[]}')
      const result = await importFromTarget(
        restored.db,
        freshStore,
        createLocalFsTarget({ root: other }),
        '2027-02',
        signal,
      )
      expect(result).toMatchObject({ ok: false, error: { unresolved: expect.any(Array) } })
    } finally {
      await restored.drop()
    }
  })
})
