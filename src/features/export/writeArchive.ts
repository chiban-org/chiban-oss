import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { sql } from 'drizzle-orm'
import { APP_VERSION } from '@/config/appVersion'
import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { getMigrationHead } from '@/db/migrationHead'
import type { ArchiveSink } from '@/features/export/archiveTypes'
import {
  type BundleCapture,
  type BundleOptions,
  csvEntry,
  emitBundle,
  finishBundle,
  startBundle,
} from '@/features/export/bundle'
import { dumpEntity } from '@/features/export/dumpEntity'
import { EXPORT_ENTITIES, exportOrder } from '@/features/export/entities'
import { renderFormatDoc } from '@/features/export/formatDoc'
import {
  EXPORT_FORMAT_VERSION,
  type ExportManifest,
  filePath,
  manifestBytes,
  manifestChecksumLine,
} from '@/features/export/manifest'
import { packInfo } from '@/features/packs/packInfo'
import type { ObjectStore } from '@/features/storage/objectStore'
import { getTownSettings } from '@/features/town/settings'

export interface WriteArchiveOptions {
  exportId: string
  kind: 'business' | 'incremental'
  base: ExportManifest | null
  bundle?: BundleOptions
}

interface FileRow extends Record<string, unknown> {
  sha256: string
  size_bytes: number
  content_type: string
  storage_key: string
}

function verifyingStream(expectedSha: string, expectedSize: number): Transform {
  const hash = createHash('sha256')
  let size = 0
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk)
      size += chunk.length
      cb(null, chunk)
    },
    flush(cb) {
      if (hash.digest('hex') !== expectedSha || size !== expectedSize) {
        cb(
          new AppError(ErrorIds.EXPORT_BLOB_INVALID, 'stored file does not match its hash', {
            sha256: expectedSha,
          }),
        )
        return
      }
      cb()
    },
  })
}

async function emitBytes(sink: ArchiveSink, path: string, bytes: Buffer): Promise<void> {
  await sink.write({ path, size: bytes.length, body: Readable.from([bytes]) })
}

async function emit(
  manifest: ExportManifest,
  fileRows: FileRow[],
  workDir: string,
  store: ObjectStore,
  exportId: string,
  sink: ArchiveSink,
  signal: AbortSignal,
): Promise<void> {
  const bytes = manifestBytes(manifest)
  await emitBytes(sink, 'manifest.json', bytes)
  await emitBytes(sink, 'manifest.sha256', Buffer.from(manifestChecksumLine(bytes), 'utf8'))
  await emitBytes(sink, 'FORMAT.md', Buffer.from(renderFormatDoc(EXPORT_ENTITIES), 'utf8'))
  for (const entity of manifest.entities) {
    if (entity.inExport !== exportId) continue
    const local = join(workDir, `${entity.name}.ndjson`)
    const { size } = await stat(local)
    await sink.write({ path: entity.path, size, body: createReadStream(local) })
  }
  await emitBundle(manifest, workDir, sink)
  const owned = new Map(
    manifest.files.filter((f) => f.inExport === exportId).map((f) => [f.sha256, f]),
  )
  for (const row of fileRows) {
    const file = owned.get(row.sha256)
    if (file === undefined) continue
    signal.throwIfAborted()
    const stream = await store.getStream(row.storage_key, signal)
    if (!stream.ok) {
      throw new AppError(ErrorIds.EXPORT_BLOB_INVALID, 'stored file is missing', {
        sha256: row.sha256,
      })
    }
    const body = Readable.fromWeb(stream.value as never).pipe(
      verifyingStream(row.sha256, file.size),
    )
    await sink.write({ path: file.path, size: file.size, body })
  }
}

export async function writeArchive(
  db: Db,
  store: ObjectStore,
  options: WriteArchiveOptions,
  sink: ArchiveSink,
  signal: AbortSignal,
): Promise<ExportManifest> {
  const workDir = join(env.EXPORT_WORK_DIR, options.exportId)
  await mkdir(workDir, { recursive: true })
  try {
    const snapshot = await db.transaction(
      async (tx) => {
        await tx.execute(sql`set local time zone 'UTC'`)
        const entities: ExportManifest['entities'] = []
        const capture: BundleCapture | null =
          options.bundle === undefined ? null : await startBundle(tx, options.bundle, workDir)
        for (const entity of exportOrder(EXPORT_ENTITIES)) {
          const table = capture === null ? null : await capture.tables.begin(entity)
          const dumped = await dumpEntity(
            tx,
            entity,
            join(workDir, `${entity.name}.ndjson`),
            signal,
            table,
          )
          if (capture !== null && dumped.table !== null) {
            capture.csv.push(csvEntry(entity.name, { ...dumped.table, count: dumped.count }))
          }
          entities.push({
            name: entity.name,
            path: entity.file,
            count: dumped.count,
            sha256: dumped.sha256,
            inExport: options.exportId,
          })
        }
        const fileRows = await tx.execute<FileRow>(
          sql`select sha256, size_bytes::float8 as size_bytes, content_type, storage_key from files order by sha256`,
        )
        const town = await getTownSettings(tx, signal)
        const head = await getMigrationHead(tx, signal)
        return { entities, fileRows: fileRows.rows, town, head, capture }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
    if (!snapshot.town.ok || snapshot.head === null) {
      throw new AppError(ErrorIds.EXPORT_ARCHIVE_INVALID, 'town is not configured')
    }
    const extras =
      options.bundle === undefined || snapshot.capture === null
        ? null
        : await finishBundle({
            capture: snapshot.capture,
            bundle: options.bundle,
            files: snapshot.fileRows.map((f) => ({
              sha256: f.sha256,
              size: f.size_bytes,
              contentType: f.content_type,
              storageKey: f.storage_key,
            })),
            workDir,
            store,
            signal,
          })
    const base = options.base
    const baseEntities = new Map(base?.entities.map((e) => [e.name, e]) ?? [])
    const baseFiles = new Map(base?.files.map((f) => [f.sha256, f]) ?? [])
    const manifest: ExportManifest = {
      format: 'chiban-export',
      formatVersion: EXPORT_FORMAT_VERSION,
      kind: options.kind,
      exportId: options.exportId,
      baseExportId: base?.exportId ?? null,
      createdAt: new Date().toISOString(),
      town: {
        name: snapshot.town.value.name,
        stateCode: snapshot.town.value.stateCode,
        timeZone: snapshot.town.value.timeZone,
      },
      appVersion: APP_VERSION,
      pack: packInfo(),
      migrationHead: snapshot.head,
      entities: snapshot.entities.map((e) => {
        const prior = baseEntities.get(e.name)
        return prior !== undefined && prior.sha256 === e.sha256
          ? { ...e, inExport: prior.inExport }
          : e
      }),
      files: snapshot.fileRows.map((f) => ({
        sha256: f.sha256,
        size: f.size_bytes,
        contentType: f.content_type,
        path: filePath(f.sha256),
        inExport: baseFiles.get(f.sha256)?.inExport ?? options.exportId,
      })),
      ...extras,
    }
    await emit(manifest, snapshot.fileRows, workDir, store, options.exportId, sink, signal)
    return manifest
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
