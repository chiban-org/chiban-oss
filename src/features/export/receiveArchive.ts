import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { PassThrough, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ArchiveEntry } from '@/features/export/archiveTypes'
import { EXPORT_ENTITIES } from '@/features/export/entities'
import { type ExportManifest, filePath, manifestChecksumLine } from '@/features/export/manifest'
import { readAll } from '@/features/export/readArchive'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const ENTITY_BY_NAME = new Map(EXPORT_ENTITIES.map((e) => [e.name, e]))

export interface ReceiveContext {
  manifest: ExportManifest
  manifestBytes: Buffer
  workDir: string
  store: ObjectStore
  signal: AbortSignal
}

export type ReceiveError =
  | 'manifest_mismatch'
  | { hashMismatch: string[] }
  | { uploadFailed: string }

type EntryVerdict = 'ok' | 'checksum_ok' | 'manifest_mismatch' | 'bad_file' | 'upload_failed'

function blobKeyOf(sha: string): string {
  return `blobs/sha256/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`
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

export function manifestPathsAreSafe(manifest: ExportManifest): boolean {
  const names = new Set<string>()
  for (const entity of manifest.entities) {
    const known = ENTITY_BY_NAME.get(entity.name)
    if (known === undefined || known.file !== entity.path || names.has(entity.name)) return false
    names.add(entity.name)
  }
  return manifest.files.every((f) => f.path === filePath(f.sha256))
}

async function receiveFile(
  entry: ArchiveEntry,
  file: ExportManifest['files'][number],
  store: ObjectStore,
  signal: AbortSignal,
): Promise<'ok' | 'bad_file' | 'upload_failed'> {
  const h = hashing()
  const sink = new PassThrough()
  const key = blobKeyOf(file.sha256)
  const outcome = { uploadFailed: false }
  const uploading = store.upload(key, sink, file.contentType, signal).catch(() => {
    outcome.uploadFailed = true
    sink.destroy()
  })
  await pipeline(entry.body, h.transform, sink).catch(() => undefined)
  await uploading
  const digest = h.digest()
  const valid = digest.sha256 === file.sha256 && digest.size === file.size
  if (outcome.uploadFailed || !valid) await store.delete(key, signal).catch(() => undefined)
  if (outcome.uploadFailed) return 'upload_failed'
  return valid ? 'ok' : 'bad_file'
}

function isBundlePath(manifest: ExportManifest, path: string): boolean {
  const { tables, pdfa } = manifest
  if (tables?.workbook.path === path || tables?.csv.some((c) => c.path === path) === true) {
    return true
  }
  return pdfa?.some((p) => p.status === 'converted' && p.path === path) === true
}

async function handleEntry(ctx: ReceiveContext, entry: ArchiveEntry): Promise<EntryVerdict> {
  if (entry.path === 'manifest.sha256') {
    const text = (await readAll(entry.body, 1024)).toString('utf8')
    return text === manifestChecksumLine(ctx.manifestBytes) ? 'checksum_ok' : 'manifest_mismatch'
  }
  if (entry.path === 'FORMAT.md') {
    entry.body.resume()
    return 'ok'
  }
  if (isBundlePath(ctx.manifest, entry.path)) {
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
  return await receiveFile(entry, file, ctx.store, ctx.signal)
}

export async function receive(
  iterator: AsyncIterator<ArchiveEntry>,
  ctx: ReceiveContext,
): Promise<Result<number, ReceiveError>> {
  if (!manifestPathsAreSafe(ctx.manifest)) return err('manifest_mismatch')
  const seen = new Set<string>()
  const bad: string[] = []
  let sumsOk = false
  for (let step = await iterator.next(); step.done !== true; step = await iterator.next()) {
    ctx.signal.throwIfAborted()
    seen.add(step.value.path)
    const verdict = await handleEntry(ctx, step.value)
    if (verdict === 'manifest_mismatch') return err('manifest_mismatch')
    if (verdict === 'upload_failed') return err({ uploadFailed: step.value.path })
    if (verdict === 'checksum_ok') sumsOk = true
    if (verdict === 'bad_file') bad.push(step.value.path)
  }
  if (bad.length > 0) return err({ hashMismatch: bad })
  const expected = [...ctx.manifest.entities, ...ctx.manifest.files].map((e) => e.path)
  if (!sumsOk || expected.some((p) => !seen.has(p))) return err('manifest_mismatch')
  return ok(ctx.manifest.files.length)
}
