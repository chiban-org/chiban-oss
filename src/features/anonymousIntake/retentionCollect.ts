import { execFile } from 'node:child_process'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import type { ProbeBackup, ProbeObject } from '@/features/anonymousIntake/retentionProbe'
import { tarSource } from '@/features/export/readArchive'
import { decryptStream } from '@/features/export/recovery/envelope'
import type { ObjectStore, ObjectStoreConfig } from '@/features/storage/objectStore'

const run = promisify(execFile)
const OBJECT_PREFIX = 'objects/'
const DUMP_ENTRY = 'database.dump'
const MAX_DUMP_BYTES = 1024 * 1024 * 1024
const EXEMPT_TABLES = ['users', 'user_roles', 'sessions'] as const

export async function dumpDatabaseText(db: Db, signal: AbortSignal): Promise<string> {
  const tables = await db.execute<{ table_name: string }>(
    sql`select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  )
  const parts: string[] = []
  for (const { table_name } of tables.rows) {
    signal.throwIfAborted()
    if ((EXEMPT_TABLES as readonly string[]).includes(table_name)) continue
    const rows = await db.execute<{ row: string }>(
      sql.raw(`select t::text as row from "${table_name}" t`),
    )
    parts.push(...rows.rows.map((r) => `${table_name}\t${r.row}`))
  }
  return parts.join('\n')
}

export function stripExemptCopyBlocks(plainDump: string): string {
  const lines = plainDump.split('\n')
  const kept: string[] = []
  let skipping = false
  for (const line of lines) {
    if (skipping) {
      skipping = line !== '\\.'
      continue
    }
    const exempt = EXEMPT_TABLES.some((t) => line.startsWith(`COPY public.${t} `))
    if (exempt) skipping = true
    else kept.push(line)
  }
  return kept.join('\n')
}

export async function listObjectsForProbe(
  config: ObjectStoreConfig,
  store: ObjectStore,
  signal: AbortSignal,
): Promise<ProbeObject[]> {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })
  const out: ProbeObject[] = []
  for (const key of await store.list('', signal)) {
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }), {
      abortSignal: signal,
    })
    const body = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
      abortSignal: signal,
    })
    out.push({
      key,
      metadata: head.Metadata ?? {},
      contentDisposition: head.ContentDisposition ?? null,
      bytes: (await body.Body?.transformToByteArray()) ?? new Uint8Array(),
    })
  }
  return out
}

async function filesUnder(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [])
  const nested = await Promise.all(
    names.map(async (name) => {
      const full = join(dir, name)
      return (await stat(full)).isDirectory() ? await filesUnder(full) : [full]
    }),
  )
  return nested.flat()
}

export async function newestBackupIn(dir: string): Promise<string | null> {
  const dated = await Promise.all(
    (await filesUnder(dir)).map(async (path) => ({ path, at: (await stat(path)).mtimeMs })),
  )
  return dated.sort((a, b) => b.at - a.at)[0]?.path ?? null
}

export async function readBackupForProbe(
  input: { file: string; passphrase: string; pgRestorePath: string },
  signal: AbortSignal,
): Promise<ProbeBackup> {
  const work = await mkdtemp(join(tmpdir(), 'chiban-probe-'))
  const dumpPath = join(work, DUMP_ENTRY)
  const objects: ProbeBackup['objects'] = []
  const source = tarSource(decryptStream(createReadStream(input.file), input.passphrase))
  for await (const entry of source.entries()) {
    signal.throwIfAborted()
    if (entry.path === DUMP_ENTRY) await pipeline(entry.body, createWriteStream(dumpPath))
    else {
      if (entry.path.startsWith(OBJECT_PREFIX)) {
        objects.push({ key: entry.path.slice(OBJECT_PREFIX.length), metadata: {} })
      }
      entry.body.resume()
    }
  }
  const restored = await run(
    input.pgRestorePath,
    ['--no-owner', '--no-privileges', '--file=-', dumpPath],
    { maxBuffer: MAX_DUMP_BYTES, signal },
  )
  return { database: stripExemptCopyBlocks(restored.stdout), objects }
}
