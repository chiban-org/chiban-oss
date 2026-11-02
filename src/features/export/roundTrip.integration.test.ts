import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { files, parcels } from '@/db/schema'
import { compareTowns } from '@/features/export/compareTowns'
import { EXPORT_ENTITIES } from '@/features/export/entities'
import { importArchive } from '@/features/export/importArchive'
import { tarSource } from '@/features/export/readArchive'
import { createTarSink } from '@/features/export/tarSink'
import { writeArchive } from '@/features/export/writeArchive'
import { getObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedExportTown } from '@/test/exportFixtures'
import { makeTestStore } from '@/test/minio'

const signal = new AbortController().signal
const sourceStore = getObjectStore()
let source: TestDb
let tar: Buffer

async function buildTar(db: TestDb['db']): Promise<Buffer> {
  const out = createTarSink()
  const chunks: Buffer[] = []
  out.stream.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<void>((resolve) => out.stream.on('end', () => resolve()))
  await writeArchive(
    db,
    sourceStore,
    { exportId: crypto.randomUUID(), kind: 'business', base: null },
    out.sink,
    signal,
  )
  out.finish()
  await finished
  return Buffer.concat(chunks)
}

const sourceOf = (bytes: Buffer) => tarSource(Readable.from([bytes]))

async function freshTarget() {
  const target = await makeTestDb()
  const { store } = await makeTestStore()
  return { target, store }
}

beforeAll(async () => {
  source = await makeTestDb()
  await seedExportTown(source.db, signal)
  tar = await buildTar(source.db)
}, 300_000)
afterAll(async () => {
  await source.drop()
})

describe('archive round trip', () => {
  it('round trip of the seeded demo town preserves every record, relationship, and file hash', async () => {
    const { target, store } = await freshTarget()
    try {
      const result = await importArchive(target.db, store, sourceOf(tar), signal)
      expect(result.ok, JSON.stringify(result)).toBe(true)
      const diffs = await compareTowns(source.db, target.db, signal)
      expect(diffs.filter((d) => d.onlyInA + d.onlyInB + d.differing > 0)).toEqual([])
      const rows = await target.db.select().from(files)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        const stream = await store.getStream(row.storageKey, signal)
        if (!stream.ok) throw new Error(`missing ${row.sha256}`)
        const bytes = Buffer.from(await new Response(stream.value).arrayBuffer())
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256)
      }
    } finally {
      await target.drop()
    }
  }, 120_000)

  it('the seeded fixture has at least one row in every exported entity', async () => {
    const empty: string[] = []
    for (const entity of EXPORT_ENTITIES) {
      const r = await source.db.execute<{ n: number }>(
        sql.raw(`select count(*)::int as n from "${entity.name}"`),
      )
      if ((r.rows[0]?.n ?? 0) === 0) empty.push(entity.name)
    }
    expect(empty).toEqual([])
  })

  it('import into a database with one parcel is not_empty', async () => {
    const { target, store } = await freshTarget()
    try {
      await target.db.insert(parcels).values({})
      const result = await importArchive(target.db, store, sourceOf(tar), signal)
      expect(result).toMatchObject({ ok: false, error: 'not_empty' })
    } finally {
      await target.drop()
    }
  })

  it('archive from another migration head is versionMismatch', async () => {
    const { target, store } = await freshTarget()
    try {
      const entries = await collect(tar)
      const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}')
      manifest.migrationHead = '0000_other'
      entries.set('manifest.json', Buffer.from(JSON.stringify(manifest)))
      const result = await importArchive(target.db, store, sourceOf(await rebuild(entries)), signal)
      expect(result).toMatchObject({
        ok: false,
        error: { versionMismatch: { archive: '0000_other' } },
      })
    } finally {
      await target.drop()
    }
  })

  it('a flipped byte in one file is hashMismatch naming that file and nothing is committed', async () => {
    const { target, store } = await freshTarget()
    try {
      const entries = await collect(tar)
      const victim = [...entries.keys()].find((k) => k.startsWith('files/'))
      expect(victim).toBeDefined()
      const bytes = Buffer.from(entries.get(victim ?? '') ?? Buffer.alloc(0))
      bytes[0] = (bytes[0] ?? 0) ^ 0xff
      entries.set(victim ?? '', bytes)
      const result = await importArchive(target.db, store, sourceOf(await rebuild(entries)), signal)
      expect(result).toMatchObject({ ok: false, error: { hashMismatch: [victim] } })
      expect((await target.db.select().from(parcels)).length).toBe(0)
    } finally {
      await target.drop()
    }
  })

  it('an edited ndjson line is manifest_mismatch', async () => {
    const { target, store } = await freshTarget()
    try {
      const entries = await collect(tar)
      const text = entries.get('data/parcels.ndjson')?.toString('utf8') ?? ''
      entries.set('data/parcels.ndjson', Buffer.from(text.replace('"id"', '"id" ')))
      const result = await importArchive(target.db, store, sourceOf(await rebuild(entries)), signal)
      expect(result).toMatchObject({ ok: false, error: 'manifest_mismatch' })
      expect((await target.db.select().from(parcels)).length).toBe(0)
    } finally {
      await target.drop()
    }
  })

  it('imported ledger allocations still sum to their entries', async () => {
    const { target, store } = await freshTarget()
    try {
      const result = await importArchive(target.db, store, sourceOf(tar), signal)
      expect(result.ok).toBe(true)
      const bad = await target.db.execute<{ n: number }>(sql`
        select count(*)::int as n from ledger_entries e
        where e.amount_cents <> coalesce((select sum(a.amount_cents) from ledger_allocations a where a.entry_id = e.id), 0)`)
      expect(bad.rows[0]?.n).toBe(0)
      const entries = await target.db.execute<{ n: number }>(
        sql`select count(*)::int as n from ledger_entries`,
      )
      expect(entries.rows[0]?.n).toBeGreaterThan(0)
    } finally {
      await target.drop()
    }
  })

  it('a second import into the restored town is not_empty', async () => {
    const { target, store } = await freshTarget()
    try {
      expect((await importArchive(target.db, store, sourceOf(tar), signal)).ok).toBe(true)
      const again = await importArchive(target.db, store, sourceOf(tar), signal)
      expect(again).toMatchObject({ ok: false, error: 'not_empty' })
    } finally {
      await target.drop()
    }
  })
})

async function collect(bytes: Buffer): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  for await (const entry of sourceOf(bytes).entries()) {
    const chunks: Buffer[] = []
    for await (const c of entry.body) chunks.push(Buffer.from(c as Uint8Array))
    out.set(entry.path, Buffer.concat(chunks))
  }
  return out
}

async function rebuild(entries: Map<string, Buffer>): Promise<Buffer> {
  const out = createTarSink()
  const chunks: Buffer[] = []
  out.stream.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<void>((resolve) => out.stream.on('end', () => resolve()))
  for (const [path, bytes] of entries) {
    await out.sink.write({ path, size: bytes.length, body: Readable.from([bytes]) })
  }
  out.finish()
  await finished
  return Buffer.concat(chunks)
}
