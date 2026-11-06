import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { env } from '@/config/env'
import { files } from '@/db/schema'
import { createBackup } from '@/features/backup/createBackup'
import { restoreVerify } from '@/features/backup/restoreVerify'
import { tarSource } from '@/features/export/readArchive'
import { decryptStream } from '@/features/export/recovery/envelope'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import {
  createObjectStore,
  getObjectStore,
  objectStoreConfigFromEnv,
} from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedExportTown } from '@/test/exportFixtures'
import { makeParcel } from '@/test/parcels'

const signal = new AbortController().signal
const PASSPHRASE = 'correct horse battery staple'
const NOW = new Date('2027-06-02T16:00:00Z')
const store = getObjectStore()
let source: TestDb
let root: string
let backupFile: string
let scratchBuckets: string[] = []

function adminUrl(): string {
  const url = new URL(source.url)
  url.pathname = `/${inject('testPg').adminDatabase}`
  return url.toString()
}

function scratchStore(bucket: string) {
  scratchBuckets.push(bucket)
  return createObjectStore({ ...objectStoreConfigFromEnv(), bucket })
}

async function backup(passphrase = PASSPHRASE) {
  return await createBackup(
    {
      db: source.db,
      pgDumpPath: 'pg_dump',
      databaseUrl: source.url,
      store,
      secretKeys: env.CHIBAN_SECRET_KEYS,
      activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
      passphrase,
      target: createLocalFsTarget({ root }),
      now: NOW,
    },
    signal,
  )
}

async function verify(file: string, passphrase = PASSPHRASE, keep = false) {
  return await restoreVerify(
    {
      pgRestorePath: 'pg_restore',
      sourceDb: source.db,
      adminDatabaseUrl: adminUrl(),
      passphrase,
      backupBytes: createReadStream(file),
      scratchStore,
      keep,
    },
    signal,
  )
}

async function scratchDatabases(): Promise<string[]> {
  const r = await source.db.execute<{ datname: string }>(
    sql`select datname from pg_database where datname like 'chiban_restore_check_%'`,
  )
  return r.rows.map((row) => row.datname)
}

async function leftovers(): Promise<{ databases: string[]; buckets: string[] }> {
  const buckets: string[] = []
  for (const name of scratchBuckets) {
    if (
      await createObjectStore({ ...objectStoreConfigFromEnv(), bucket: name }).bucketExists(signal)
    ) {
      buckets.push(name)
    }
  }
  return { databases: await scratchDatabases(), buckets }
}

async function entriesOf(file: string, passphrase = PASSPHRASE): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  for await (const entry of tarSource(
    decryptStream(createReadStream(file), passphrase),
  ).entries()) {
    const chunks: Buffer[] = []
    for await (const c of entry.body) chunks.push(Buffer.from(c as Uint8Array))
    out.set(entry.path, Buffer.concat(chunks))
  }
  return out
}

beforeAll(async () => {
  source = await makeTestDb()
  await seedExportTown(source.db, signal)
  await store.putBytes(
    'exports/leftover/chiban-export.zip',
    Buffer.from('not part of a backup'),
    'application/x-tar',
    signal,
  )
  root = await mkdtemp(join(tmpdir(), 'chiban-backup-'))
  const made = await backup()
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  backupFile = join(root, made.value.path)
}, 300_000)
afterAll(async () => {
  await source.drop()
})

describe('backup and restore verification', () => {
  it('backup then restore verify of the seeded demo town reports zero differences and re-hashes every file', async () => {
    expect(backupFile.endsWith('backups/chiban-backup-2027-06-02.bin')).toBe(true)
    const report = await verify(backupFile)
    if (!report.ok) throw new Error(JSON.stringify(report.error))
    const fileRows = await source.db.select().from(files)
    expect(report.value).toMatchObject({ ok: true, dumpOk: true, differences: [] })
    expect(fileRows.length).toBeGreaterThan(0)
    expect(report.value.filesRehashed).toBe(fileRows.length)
    expect(report.value.objectsChecked).toBeGreaterThanOrEqual(fileRows.length)
    expect(report.value.migrationHead).not.toBe('')
  }, 300_000)

  it('the scratch database and bucket are gone after a successful verification', async () => {
    expect(await leftovers()).toEqual({ databases: [], buckets: [] })
    scratchBuckets = []
    const kept = await verify(backupFile, PASSPHRASE, true)
    if (!kept.ok) throw new Error(JSON.stringify(kept.error))
    expect(kept.value.scratchDatabase).toMatch(/^chiban_restore_check_/)
    const present = await leftovers()
    expect(present.databases).toEqual([kept.value.scratchDatabase])
    expect(present.buckets).toHaveLength(1)
    await source.db.execute(sql.raw(`drop database "${kept.value.scratchDatabase}" with (force)`))
    const bucketStore = createObjectStore({
      ...objectStoreConfigFromEnv(),
      bucket: present.buckets[0] ?? '',
    })
    for (const key of await bucketStore.list('', signal)) await bucketStore.delete(key, signal)
    await bucketStore.deleteBucket(signal)
    scratchBuckets = []
  }, 300_000)

  it('exports/ objects are not backed up and the archive holds the dump, objects, keys and manifest', async () => {
    const entries = await entriesOf(backupFile)
    const names = [...entries.keys()]
    expect(names.filter((n) => n.startsWith('objects/exports/'))).toEqual([])
    expect(names.some((n) => n.startsWith('objects/blobs/'))).toBe(true)
    expect(names).toContain('database.dump')
    expect(names).toContain('secrets.json')
    expect(names).toContain('backup-manifest.json')
    const secrets = JSON.parse((entries.get('secrets.json') ?? Buffer.alloc(0)).toString())
    expect(secrets.CHIBAN_ACTIVE_KEY_ID).toBe(env.CHIBAN_ACTIVE_KEY_ID)
    const manifest = JSON.parse((entries.get('backup-manifest.json') ?? Buffer.alloc(0)).toString())
    expect(manifest.dumpSha256).toBe(
      createHash('sha256')
        .update(entries.get('database.dump') ?? Buffer.alloc(0))
        .digest('hex'),
    )
    expect(manifest.objects.length).toBe(names.filter((n) => n.startsWith('objects/')).length)
  }, 300_000)

  it("the backup file contains neither the dump magic nor any secret key bytes nor a document's plain bytes", async () => {
    const bytes = await readFile(backupFile)
    expect(bytes.includes(Buffer.from('PGDMP'))).toBe(false)
    for (const key of Object.values(env.CHIBAN_SECRET_KEYS)) {
      expect(bytes.includes(Buffer.from(String(key)))).toBe(false)
    }
    const [row] = await source.db
      .select()
      .from(files)
      .where(sql`${files.contentType} = 'application/pdf'`)
      .limit(1)
    const stream = await store.getStream(row?.storageKey ?? '', signal)
    if (!stream.ok) throw new Error('no document')
    const plain = Buffer.from(await new Response(stream.value).arrayBuffer())
    expect(plain.length).toBeGreaterThan(40)
    expect(bytes.includes(plain.subarray(0, 40))).toBe(false)
  })

  it('a wrong passphrase fails verification and leaves nothing behind', async () => {
    const result = await verify(backupFile, 'another long passphrase here')
    expect(result).toEqual({ ok: false, error: 'wrong_passphrase_or_damaged' })
    expect(await leftovers()).toEqual({ databases: [], buckets: [] })
  })

  it('a damaged backup fails and leaves no scratch database or bucket behind', async () => {
    const bytes = await readFile(backupFile)
    const damaged = Buffer.from(bytes)
    const at = Math.floor(damaged.length * 0.9)
    damaged.writeUInt8(damaged.readUInt8(at) ^ 0xff, at)
    const file = join(root, 'damaged.bin')
    await writeFile(file, damaged)
    scratchBuckets = []
    const result = await verify(file)
    expect(result).toEqual({ ok: false, error: 'wrong_passphrase_or_damaged' })
    expect(scratchBuckets.length).toBeGreaterThan(0)
    expect(await leftovers()).toEqual({ databases: [], buckets: [] })
  }, 300_000)

  it('a passphrase under 16 characters is refused and writes nothing', async () => {
    const before = await readdir(root, { recursive: true })
    const result = await backup('too short')
    expect(result).toEqual({ ok: false, error: 'passphrase_too_short' })
    expect(await readdir(root, { recursive: true })).toEqual(before)
  })

  it('a row added after the backup shows up as a difference and ok is false', async () => {
    await makeParcel(source.db, [])
    const report = await verify(backupFile)
    if (!report.ok) throw new Error(JSON.stringify(report.error))
    expect(report.value.ok).toBe(false)
    expect(report.value.differences).toEqual([
      { entity: 'parcels', onlyInA: 1, onlyInB: 0, differing: 0 },
    ])
    expect(await leftovers()).toEqual({ databases: [], buckets: [] })
  }, 300_000)
})
