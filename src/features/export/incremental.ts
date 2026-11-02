import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { exportsTable, exportTargets } from '@/db/schema'
import type { ArchiveSink } from '@/features/export/archiveTypes'
import { EXPORT_ROOT, recordInIndex } from '@/features/export/exportIndex'
import { type ExportManifest, manifestBytes, manifestSchema } from '@/features/export/manifest'
import { readAll } from '@/features/export/readArchive'
import { TargetFailure } from '@/features/export/targets/targetFailure'
import type { StorageTarget, TargetError } from '@/features/export/targets/types'
import { writeArchive } from '@/features/export/writeArchive'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export interface IncrementalReport {
  exportId: string
  entitiesWritten: number
  filesWritten: number
}

const HELD_PATHS = ['FORMAT.md', 'manifest.sha256', 'manifest.json'] as const
const HELD_LIMIT = 256 * 1024 * 1024

async function folderFor(db: Db, targetId: string, month: string): Promise<string> {
  const rows = await db
    .select({ storageKey: exportsTable.storageKey })
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.targetId, targetId),
        eq(exportsTable.kind, 'incremental'),
        eq(exportsTable.status, 'ready'),
      ),
    )
  const taken = rows.filter((r) => {
    const key = r.storageKey ?? ''
    return key === `${EXPORT_ROOT}/${month}` || key.startsWith(`${EXPORT_ROOT}/${month}-`)
  }).length
  return taken === 0 ? month : `${month}-${taken + 1}`
}

async function lastReadyManifest(db: Db, targetId: string): Promise<ExportManifest | null> {
  const [row] = await db
    .select({ manifest: exportsTable.manifest })
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.targetId, targetId),
        eq(exportsTable.kind, 'incremental'),
        eq(exportsTable.status, 'ready'),
      ),
    )
    .orderBy(desc(exportsTable.finishedAt))
    .limit(1)
  const parsed = manifestSchema.safeParse(row?.manifest)
  return parsed.success ? parsed.data : null
}

function unwrap(result: Result<unknown, TargetError>): void {
  if (!result.ok) throw new TargetFailure(result.error)
}

async function discard(body: Readable): Promise<void> {
  body.resume()
  await new Promise<void>((resolve, reject) => {
    body.once('end', resolve)
    body.once('error', reject)
  })
}

function targetSink(target: StorageTarget, folder: string, signal: AbortSignal) {
  const held = new Map<string, Buffer>()
  const written = { entities: 0, files: 0, bytes: 0 }
  const sink: ArchiveSink = {
    async write(entry) {
      if ((HELD_PATHS as readonly string[]).includes(entry.path)) {
        held.set(entry.path, await readAll(entry.body, HELD_LIMIT))
        return
      }
      if (entry.path.startsWith('files/')) {
        const path = `${EXPORT_ROOT}/${entry.path}`
        const present = await target.exists(path, signal)
        if (!present.ok) {
          entry.body.destroy()
          throw new TargetFailure(present.error)
        }
        if (present.value) return await discard(entry.body)
        unwrap(await target.put(path, entry.body, entry.size, signal))
        written.files += 1
      } else {
        unwrap(
          await target.put(
            `${EXPORT_ROOT}/${folder}/${entry.path}`,
            entry.body,
            entry.size,
            signal,
          ),
        )
        written.entities += 1
      }
      written.bytes += entry.size
    },
  }
  const finish = async () => {
    for (const name of HELD_PATHS) {
      const bytes = held.get(name) ?? Buffer.alloc(0)
      unwrap(
        await target.put(
          `${EXPORT_ROOT}/${folder}/${name}`,
          Readable.from([bytes]),
          bytes.length,
          signal,
        ),
      )
      written.bytes += bytes.length
    }
  }
  return { sink, finish, written }
}

async function recordFailure(db: Db, exportId: string, targetId: string, detail: string) {
  const now = new Date()
  await db
    .update(exportsTable)
    .set({ status: 'failed', error: detail, finishedAt: now })
    .where(eq(exportsTable.id, exportId))
  await db
    .update(exportTargets)
    .set({ lastFailureAt: now, lastError: detail })
    .where(eq(exportTargets.id, targetId))
}

export async function runIncremental(
  db: Db,
  store: ObjectStore,
  target: StorageTarget,
  targetId: string,
  now: Date,
  signal: AbortSignal,
): Promise<Result<IncrementalReport, TargetError>> {
  const month = (await townToday(db, now, signal)).slice(0, 7)
  const folder = await folderFor(db, targetId, month)
  const base = await lastReadyManifest(db, targetId)
  const exportId = randomUUID()
  await db.insert(exportsTable).values({
    id: exportId,
    kind: 'incremental',
    status: 'running',
    targetId,
    baseExportId: base?.exportId ?? null,
    storageKey: `${EXPORT_ROOT}/${folder}`,
  })
  const out = targetSink(target, folder, signal)
  try {
    const manifest = await writeArchive(
      db,
      store,
      { exportId, kind: 'incremental', base },
      out.sink,
      signal,
    )
    await out.finish()
    unwrap(await recordInIndex(target, { exportId, folder }, signal))
    const finishedAt = new Date()
    await db
      .update(exportsTable)
      .set({
        status: 'ready',
        manifest,
        manifestSha256: createHash('sha256').update(manifestBytes(manifest)).digest('hex'),
        sizeBytes: out.written.bytes,
        finishedAt,
      })
      .where(eq(exportsTable.id, exportId))
    await db
      .update(exportTargets)
      .set({ lastSuccessAt: finishedAt, lastError: null })
      .where(eq(exportTargets.id, targetId))
    return ok({
      exportId,
      entitiesWritten: out.written.entities,
      filesWritten: out.written.files,
    })
  } catch (e) {
    if (e instanceof TargetFailure) {
      await recordFailure(db, exportId, targetId, e.error.detail)
      return err(e.error)
    }
    await recordFailure(db, exportId, targetId, e instanceof Error ? e.message : String(e))
    throw e
  }
}
