import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { PassThrough, type Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { z } from 'zod'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import * as schema from '@/db/schema'
import { files } from '@/db/schema'
import type { ObjectRecord } from '@/features/backup/createBackup'
import { compareTowns, type TownDifference } from '@/features/export/compareTowns'
import { readAll, tarSource } from '@/features/export/readArchive'
import { connectionEnv } from '@/features/export/recovery/buildRecovery'
import { decryptStream } from '@/features/export/recovery/envelope'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const run = promisify(execFile)
const MANIFEST_LIMIT = 256 * 1024 * 1024
const OBJECT_PREFIX = 'objects/'
const CLEANUP_TIMEOUT_MS = 60_000

export interface RestoreVerifyDeps {
  pgRestorePath: string
  sourceDb: Db
  adminDatabaseUrl: string
  passphrase: string
  backupBytes: Readable
  scratchStore: (bucket: string) => ObjectStore
  keep?: boolean
}

export interface VerifyReport {
  migrationHead: string
  dumpOk: boolean
  objectsChecked: number
  filesRehashed: number
  filesMismatched: string[]
  differences: TownDifference[]
  ok: boolean
  scratchDatabase?: string
  scratchBucket?: string
}

export type VerifyError = 'wrong_passphrase_or_damaged' | 'restore_failed'

const manifestSchema = z.object({
  migrationHead: z.string().nullable(),
  dumpSha256: z.string(),
  objects: z.array(z.object({ key: z.string(), size: z.number(), sha256: z.string() })),
})

type BackupManifest = z.infer<typeof manifestSchema>

function hashing(): { transform: Transform; digest(): { sha256: string; size: number } } {
  const hash = createHash('sha256')
  let size = 0
  return {
    transform: new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk)
        size += chunk.length
        cb(null, chunk)
      },
    }),
    digest: () => ({ sha256: hash.digest('hex'), size }),
  }
}

function urlFor(adminUrl: string, database: string): string {
  const url = new URL(adminUrl)
  url.pathname = `/${database}`
  return url.toString()
}

interface Scratch {
  database: string
  bucket: string
  store: ObjectStore | null
  databaseCreated: boolean
  pool: Pool | null
}

interface Extracted {
  manifest: BackupManifest
  dumpSha: string
  seen: ObjectRecord[]
}

async function receiveObject(
  deps: RestoreVerifyDeps,
  scratch: Scratch,
  entry: { path: string; body: Readable },
  signal: AbortSignal,
): Promise<ObjectRecord> {
  if (scratch.store === null) {
    scratch.store = deps.scratchStore(scratch.bucket)
    await scratch.store.createBucket(signal)
  }
  const h = hashing()
  const sink = new PassThrough()
  const key = entry.path.slice(OBJECT_PREFIX.length)
  const uploading = scratch.store.upload(key, sink, 'application/octet-stream', signal)
  await pipeline(entry.body, h.transform, sink)
  await uploading
  return { key, ...h.digest() }
}

async function extract(
  deps: RestoreVerifyDeps,
  scratch: Scratch,
  workDir: string,
  signal: AbortSignal,
): Promise<Extracted | null> {
  const seen: ObjectRecord[] = []
  let dumpSha = ''
  let manifest: BackupManifest | null = null
  const source = tarSource(decryptStream(deps.backupBytes, deps.passphrase))
  for await (const entry of source.entries()) {
    signal.throwIfAborted()
    if (entry.path === 'database.dump') {
      const h = hashing()
      await pipeline(entry.body, h.transform, createWriteStream(join(workDir, 'database.dump')))
      dumpSha = h.digest().sha256
    } else if (entry.path === 'backup-manifest.json') {
      const parsed = manifestSchema.safeParse(
        JSON.parse((await readAll(entry.body, MANIFEST_LIMIT)).toString('utf8')),
      )
      if (!parsed.success) return null
      manifest = parsed.data
    } else if (entry.path.startsWith(OBJECT_PREFIX)) {
      seen.push(await receiveObject(deps, scratch, entry, signal))
    } else {
      entry.body.resume()
    }
  }
  return manifest === null ? null : { manifest, dumpSha, seen }
}

function manifestMatches(extracted: Extracted): boolean {
  const { manifest, dumpSha, seen } = extracted
  if (manifest.dumpSha256 !== dumpSha || manifest.objects.length !== seen.length) return false
  const wanted = new Map(manifest.objects.map((o) => [o.key, o]))
  return seen.every((o) => {
    const expected = wanted.get(o.key)
    return expected?.sha256 === o.sha256 && expected.size === o.size
  })
}

async function rehashFiles(
  scratchDb: Db,
  store: ObjectStore,
  signal: AbortSignal,
): Promise<{ checked: number; bad: string[] }> {
  const rows = await scratchDb.select().from(files)
  const bad: string[] = []
  for (const row of rows) {
    signal.throwIfAborted()
    const stream = await store.getStream(row.storageKey, signal)
    if (!stream.ok) {
      bad.push(row.sha256)
      continue
    }
    const hash = createHash('sha256')
    const reader = stream.value.getReader()
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      hash.update(part.value)
    }
    if (hash.digest('hex') !== row.sha256) bad.push(row.sha256)
  }
  return { checked: rows.length, bad }
}

async function cleanup(scratch: Scratch, admin: Pool, signal: AbortSignal): Promise<void> {
  await scratch.pool?.end().catch(() => undefined)
  if (scratch.databaseCreated) {
    await admin
      .query(`drop database if exists "${scratch.database}" with (force)`)
      .catch(() => undefined)
  }
  if (scratch.store !== null) {
    const store = scratch.store
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(CLEANUP_TIMEOUT_MS)])
    for (const key of await store.list('', bounded).catch(() => [])) {
      await store.delete(key, bounded).catch(() => undefined)
    }
    await store.deleteBucket(bounded).catch(() => undefined)
  }
}

interface RestoreRun {
  deps: RestoreVerifyDeps
  scratch: Scratch
  admin: Pool
  workDir: string
}

async function restoreDump(job: RestoreRun, signal: AbortSignal): Promise<boolean> {
  const { deps, scratch, admin, workDir } = job
  try {
    await admin.query(`create database "${scratch.database}"`)
    scratch.databaseCreated = true
    const scratchUrl = urlFor(deps.adminDatabaseUrl, scratch.database)
    await run(
      deps.pgRestorePath,
      [
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        `--dbname=${scratch.database}`,
        join(workDir, 'database.dump'),
      ],
      { env: connectionEnv(scratchUrl), signal },
    )
    scratch.pool = new Pool({ connectionString: scratchUrl, max: 2 })
    return true
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return false
  }
}

export async function restoreVerify(
  deps: RestoreVerifyDeps,
  signal: AbortSignal,
): Promise<Result<VerifyReport, VerifyError>> {
  const suffix = randomBytes(6).toString('hex')
  const scratch: Scratch = {
    database: `chiban_restore_check_${suffix}`,
    bucket: `${env.S3_BUCKET}-restore-check-${suffix}`,
    store: null,
    databaseCreated: false,
    pool: null,
  }
  const workDir = join(env.EXPORT_WORK_DIR, `restore-${suffix}`)
  await mkdir(workDir, { recursive: true })
  const admin = new Pool({ connectionString: deps.adminDatabaseUrl, max: 1 })
  const keep = deps.keep === true
  let succeeded = false
  try {
    let extracted: Extracted | null
    try {
      extracted = await extract(deps, scratch, workDir, signal)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e
      return err('wrong_passphrase_or_damaged')
    }
    if (extracted === null || !manifestMatches(extracted)) {
      return err('wrong_passphrase_or_damaged')
    }
    if (!(await restoreDump({ deps, scratch, admin, workDir }, signal)) || scratch.pool === null) {
      return err('restore_failed')
    }
    const scratchDb = drizzle(scratch.pool, { schema })
    const differences = (await compareTowns(deps.sourceDb, scratchDb, signal)).filter(
      (d) => d.onlyInA + d.onlyInB + d.differing > 0,
    )
    const rehashed =
      scratch.store === null
        ? { checked: 0, bad: ['no objects'] }
        : await rehashFiles(scratchDb, scratch.store, signal)
    succeeded = true
    return ok({
      migrationHead: extracted.manifest.migrationHead ?? '',
      dumpOk: true,
      objectsChecked: extracted.seen.length,
      filesRehashed: rehashed.checked,
      filesMismatched: rehashed.bad,
      differences,
      ok: differences.length === 0 && rehashed.bad.length === 0,
      ...(keep ? { scratchDatabase: scratch.database, scratchBucket: scratch.bucket } : {}),
    })
  } finally {
    if (keep && succeeded) await scratch.pool?.end().catch(() => undefined)
    else await cleanup(scratch, admin, signal)
    await admin.end()
    await rm(workDir, { recursive: true, force: true })
  }
}
