import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { PassThrough, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { getMigrationHead } from '@/db/migrationHead'
import type { ArchiveEntry } from '@/features/export/archiveTypes'
import { EXPORT_ENTITIES } from '@/features/export/entities'
import { DanglingRefs, insertAllEntities } from '@/features/export/insertEntities'
import {
  type ExportManifest,
  manifestChecksumLine,
  manifestSchema,
} from '@/features/export/manifest'
import { type ArchiveSource, readAll } from '@/features/export/readArchive'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const MANIFEST_LIMIT = 256 * 1024 * 1024
const SUPPORTED_MAJOR = '1'

export interface ImportArchiveReport {
  exportId: string
  entities: { name: string; count: number }[]
  files: number
}

export type ImportArchiveError =
  | 'not_empty'
  | 'unsupported_format'
  | 'manifest_mismatch'
  | { versionMismatch: { archive: string; instance: string } }
  | { hashMismatch: string[] }
  | { danglingRefs: string[] }

function blobKeyOf(sha: string): string {
  return `blobs/sha256/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`
}

async function hasExistingRecords(db: Db): Promise<boolean> {
  for (const entity of EXPORT_ENTITIES) {
    if (entity.importMode !== 'insert') continue
    const found = await db.execute<{ present: boolean }>(
      sql.raw(`select exists(select 1 from "${entity.name}") as present`),
    )
    if (found.rows[0]?.present === true) return true
  }
  return false
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

async function readManifest(
  iterator: AsyncIterator<ArchiveEntry>,
): Promise<{ manifest: ExportManifest; bytes: Buffer } | null> {
  const first = await iterator.next()
  if (first.done === true || first.value.path !== 'manifest.json') return null
  const bytes = await readAll(first.value.body, MANIFEST_LIMIT)
  try {
    const parsed = manifestSchema.safeParse(JSON.parse(bytes.toString('utf8')))
    return parsed.success ? { manifest: parsed.data, bytes } : null
  } catch {
    return null
  }
}

async function receiveFile(
  entry: ArchiveEntry,
  file: ExportManifest['files'][number],
  store: ObjectStore,
  signal: AbortSignal,
): Promise<boolean> {
  const h = hashing()
  const sink = new PassThrough()
  const key = blobKeyOf(file.sha256)
  const uploading = store.upload(key, sink, file.contentType, signal)
  await pipeline(entry.body, h.transform, sink).catch(() => undefined)
  await uploading.catch(() => undefined)
  const digest = h.digest()
  const valid = digest.sha256 === file.sha256 && digest.size === file.size
  if (!valid) await store.delete(key, signal).catch(() => undefined)
  return valid
}

interface ReceiveContext {
  manifest: ExportManifest
  manifestBytes: Buffer
  workDir: string
  store: ObjectStore
  signal: AbortSignal
}

type EntryVerdict = 'ok' | 'checksum_ok' | 'manifest_mismatch' | 'bad_file'

async function handleEntry(ctx: ReceiveContext, entry: ArchiveEntry): Promise<EntryVerdict> {
  if (entry.path === 'manifest.sha256') {
    const text = (await readAll(entry.body, 1024)).toString('utf8')
    return text === manifestChecksumLine(ctx.manifestBytes) ? 'checksum_ok' : 'manifest_mismatch'
  }
  if (entry.path === 'FORMAT.md') {
    entry.body.resume()
    return 'ok'
  }
  const entity = ctx.manifest.entities.find((e) => e.path === entry.path)
  if (entity !== undefined) {
    const h = hashing()
    await pipeline(
      entry.body,
      h.transform,
      createWriteStream(join(ctx.workDir, `${entity.name}.ndjson`)),
    )
    return h.digest().sha256 === entity.sha256 ? 'ok' : 'manifest_mismatch'
  }
  const file = ctx.manifest.files.find((f) => f.path === entry.path)
  if (file === undefined) return 'manifest_mismatch'
  return (await receiveFile(entry, file, ctx.store, ctx.signal)) ? 'ok' : 'bad_file'
}

async function receive(
  iterator: AsyncIterator<ArchiveEntry>,
  ctx: ReceiveContext,
): Promise<Result<number, 'manifest_mismatch' | { hashMismatch: string[] }>> {
  const seen = new Set<string>()
  const bad: string[] = []
  let sumsOk = false
  for (let step = await iterator.next(); step.done !== true; step = await iterator.next()) {
    ctx.signal.throwIfAborted()
    seen.add(step.value.path)
    const verdict = await handleEntry(ctx, step.value)
    if (verdict === 'manifest_mismatch') return err('manifest_mismatch')
    if (verdict === 'checksum_ok') sumsOk = true
    if (verdict === 'bad_file') bad.push(step.value.path)
  }
  if (bad.length > 0) return err({ hashMismatch: bad })
  const expected = [...ctx.manifest.entities, ...ctx.manifest.files].map((e) => e.path)
  if (!sumsOk || expected.some((p) => !seen.has(p))) return err('manifest_mismatch')
  return ok(ctx.manifest.files.length)
}

export async function importArchive(
  db: Db,
  store: ObjectStore,
  source: ArchiveSource,
  signal: AbortSignal,
): Promise<Result<ImportArchiveReport, ImportArchiveError>> {
  const workDir = join(env.EXPORT_WORK_DIR, `import-${randomUUID()}`)
  await mkdir(workDir, { recursive: true })
  try {
    const iterator = source.entries()[Symbol.asyncIterator]()
    const read = await readManifest(iterator)
    if (read === null) return err('manifest_mismatch')
    const { manifest } = read
    if (manifest.formatVersion.split('.')[0] !== SUPPORTED_MAJOR) return err('unsupported_format')
    const head = await getMigrationHead(db, signal)
    if (head !== manifest.migrationHead) {
      return err({ versionMismatch: { archive: manifest.migrationHead, instance: head ?? 'none' } })
    }
    if (await hasExistingRecords(db)) return err('not_empty')
    const received = await receive(iterator, {
      manifest,
      manifestBytes: read.bytes,
      workDir,
      store,
      signal,
    })
    if (!received.ok) return err(received.error)
    try {
      await db.transaction(async (tx) => {
        await insertAllEntities(tx, workDir, signal)
      })
    } catch (e) {
      if (e instanceof DanglingRefs) return err({ danglingRefs: e.refs })
      throw e
    }
    return ok({
      exportId: manifest.exportId,
      entities: manifest.entities.map((e) => ({ name: e.name, count: e.count })),
      files: received.value,
    })
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
