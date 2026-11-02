import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { getMigrationHead } from '@/db/migrationHead'
import type { ArchiveEntry } from '@/features/export/archiveTypes'
import { EXPORT_ENTITIES } from '@/features/export/entities'
import { DanglingRefs, insertAllEntities } from '@/features/export/insertEntities'
import { type ExportManifest, manifestSchema } from '@/features/export/manifest'
import { type ArchiveSource, readAll } from '@/features/export/readArchive'
import { receive } from '@/features/export/receiveArchive'
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
  | { uploadFailed: string }

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
