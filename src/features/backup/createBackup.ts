import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { PassThrough, Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { getMigrationHead } from '@/db/migrationHead'
import { connectionEnv } from '@/features/export/recovery/buildRecovery'
import { encryptStream } from '@/features/export/recovery/envelope'
import { TargetFailure } from '@/features/export/targets/targetFailure'
import type { StorageTarget, TargetError } from '@/features/export/targets/types'
import { createTarSink } from '@/features/export/tarSink'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

const run = promisify(execFile)

export const MIN_PASSPHRASE_LENGTH = 16
export const EXCLUDED_PREFIX = 'exports/'

export interface BackupDeps {
  db: Db
  pgDumpPath: string
  databaseUrl: string
  store: ObjectStore
  secretKeys: Record<string, string>
  activeKeyId: string
  passphrase: string
  target: StorageTarget
  now: Date
}

export interface BackupReport {
  path: string
  sizeBytes: number
  objects: number
}

export type BackupError = 'passphrase_too_short' | 'dump_failed' | 'object_unreadable' | TargetError

export interface ObjectRecord {
  key: string
  size: number
  sha256: string
}

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

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

async function dumpTo(deps: BackupDeps, file: string, signal: AbortSignal): Promise<boolean> {
  try {
    await run(
      deps.pgDumpPath,
      ['--format=custom', '--no-owner', '--no-privileges', `--file=${file}`],
      { env: connectionEnv(deps.databaseUrl), signal },
    )
    return true
  } catch {
    return false
  }
}

async function writeObject(
  deps: BackupDeps,
  tar: ReturnType<typeof createTarSink>,
  key: string,
  signal: AbortSignal,
): Promise<ObjectRecord | null> {
  const head = await deps.store.head(key, signal)
  if (!head.ok) return null
  const stream = await deps.store.getStream(key, signal)
  if (!stream.ok) return null
  const h = hashing()
  const body = new PassThrough()
  const source = Readable.fromWeb(stream.value as never)
  source.on('error', (e) => body.destroy(e))
  source.pipe(h.transform).pipe(body)
  await tar.sink.write({ path: `objects/${key}`, size: head.value.size, body })
  const digest = h.digest()
  if (digest.size !== head.value.size) throw new TargetFailure({ kind: 'bad_shape', detail: key })
  return { key, size: digest.size, sha256: digest.sha256 }
}

async function writeBytes(tar: ReturnType<typeof createTarSink>, path: string, bytes: Buffer) {
  await tar.sink.write({ path, size: bytes.length, body: Readable.from([bytes]) })
}

async function buildArchive(
  deps: BackupDeps,
  dumpFile: string,
  encFile: string,
  signal: AbortSignal,
): Promise<number> {
  const tar = createTarSink()
  const encrypted = pipeline(encryptStream(tar.stream, deps.passphrase), createWriteStream(encFile))
  encrypted.catch(() => undefined)
  try {
    const dumpSize = (await stat(dumpFile)).size
    await tar.sink.write({
      path: 'database.dump',
      size: dumpSize,
      body: createReadStream(dumpFile),
    })
    await writeBytes(
      tar,
      'secrets.json',
      Buffer.from(
        JSON.stringify({
          CHIBAN_SECRET_KEYS: JSON.stringify(deps.secretKeys),
          CHIBAN_ACTIVE_KEY_ID: deps.activeKeyId,
        }),
      ),
    )
    const objects: ObjectRecord[] = []
    const keys = (await deps.store.list('', signal)).filter((k) => !k.startsWith(EXCLUDED_PREFIX))
    for (const key of keys) {
      signal.throwIfAborted()
      const record = await writeObject(deps, tar, key, signal)
      if (record !== null) objects.push(record)
    }
    await writeBytes(
      tar,
      'backup-manifest.json',
      Buffer.from(
        JSON.stringify({
          appVersion: APP_VERSION,
          migrationHead: await getMigrationHead(deps.db, signal),
          createdAt: deps.now.toISOString(),
          dumpSha256: await sha256Of(dumpFile),
          objects,
        }),
      ),
    )
    tar.finish()
    await encrypted
    return objects.length
  } catch (e) {
    tar.stream.destroy()
    await encrypted.catch(() => undefined)
    throw e
  }
}

export async function createBackup(
  deps: BackupDeps,
  signal: AbortSignal,
): Promise<Result<BackupReport, BackupError>> {
  if (deps.passphrase.length < MIN_PASSPHRASE_LENGTH) return err('passphrase_too_short')
  const workDir = join(env.EXPORT_WORK_DIR, `backup-${randomUUID()}`)
  await mkdir(workDir, { recursive: true })
  const dumpFile = join(workDir, 'database.dump')
  const encFile = join(workDir, 'backup.bin')
  try {
    if (!(await dumpTo(deps, dumpFile, signal))) return err('dump_failed')
    let objects: number
    try {
      objects = await buildArchive(deps, dumpFile, encFile, signal)
    } catch (e) {
      if (e instanceof TargetFailure) return err('object_unreadable')
      throw e
    }
    const sizeBytes = (await stat(encFile)).size
    const day = await townToday(deps.db, deps.now, signal)
    const path = `backups/chiban-backup-${day}.bin`
    const put = await deps.target.put(path, createReadStream(encFile), sizeBytes, signal)
    if (!put.ok) return put
    return ok({ path, sizeBytes, objects })
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
