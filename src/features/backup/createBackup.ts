import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { getMigrationHead } from '@/db/migrationHead'
import {
  MissingObjects,
  type ObjectRecord,
  referencedKeys,
  unreadableKeys,
  writeObject,
} from '@/features/backup/backupObjects'
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
export const BACKUP_FOLDER = 'backups'
export const BACKUP_FILE_NAME = /^chiban-backup-\d{4}-\d{2}-\d{2}\.bin$/

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

export type BackupError =
  | 'passphrase_too_short'
  | 'dump_failed'
  | 'object_unreadable'
  | { missingObjects: string[] }
  | TargetError

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

async function writeBytes(tar: ReturnType<typeof createTarSink>, path: string, bytes: Buffer) {
  await tar.sink.write({ path, size: bytes.length, body: Readable.from([bytes]) })
}

async function buildArchive(
  deps: BackupDeps,
  dumpFile: string,
  encFile: string,
  referenced: Set<string>,
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
      const record = await writeObject(deps.store, tar, key, signal)
      if (record !== null) objects.push(record)
      else if (referenced.has(key)) throw new MissingObjects([key])
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
    const referenced = await referencedKeys(deps.db)
    const missing = await unreadableKeys(deps.store, referenced, signal)
    if (missing.length > 0) return err({ missingObjects: missing })
    if (!(await dumpTo(deps, dumpFile, signal))) return err('dump_failed')
    let objects: number
    try {
      objects = await buildArchive(deps, dumpFile, encFile, new Set(referenced), signal)
    } catch (e) {
      if (e instanceof MissingObjects) return err({ missingObjects: e.keys })
      if (e instanceof TargetFailure) return err('object_unreadable')
      throw e
    }
    const sizeBytes = (await stat(encFile)).size
    const day = await townToday(deps.db, deps.now, signal)
    const path = `${BACKUP_FOLDER}/chiban-backup-${day}.bin`
    const put = await deps.target.put(path, createReadStream(encFile), sizeBytes, signal)
    if (!put.ok) return put
    return ok({ path, sizeBytes, objects })
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
