import { createHash } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { and, eq, isNotNull } from 'drizzle-orm'
import { env } from '@/config/env'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Db } from '@/db/client'
import { exportsTable, exportTargets } from '@/db/schema'
import { manifestBytes } from '@/features/export/manifest'
import { pruneExpiredExports } from '@/features/export/pruneExports'
import { writeArchive } from '@/features/export/writeArchive'
import { createZipSink } from '@/features/export/zipSink'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { ok } from '@/types/result'
import { defineJob, enqueue, failKeepingWrites } from './defineJob'
import { exportsIncrementalJob } from './exportsIncremental'

const DAY_MS = 24 * 60 * 60 * 1000
const RETENTION_DAYS = 7
const PDFA_TIMEOUT_MS = 120_000

function exportConverter() {
  return createGhostscriptConverter({
    gsPath: env.GHOSTSCRIPT_PATH,
    iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
    timeoutMs: PDFA_TIMEOUT_MS,
  })
}

export function exportObjectKey(exportId: string, today: string): string {
  return `exports/${exportId}/chiban-export-${today}.zip`
}

export async function buildBusinessExport(
  db: Db,
  store: ObjectStore,
  exportId: string,
  signal: AbortSignal,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date()
  const key = exportObjectKey(exportId, await townToday(db, now, signal))
  await db
    .update(exportsTable)
    .set({ status: 'running', storageKey: key })
    .where(eq(exportsTable.id, exportId))
  const zip = createZipSink()
  const counted = new PassThrough()
  let size = 0
  counted.on('data', (chunk: Buffer) => {
    size += chunk.length
  })
  zip.stream.pipe(counted)
  const uploading = store.upload(key, counted, 'application/zip', signal)
  try {
    const manifest = await writeArchive(
      db,
      store,
      { exportId, kind: 'business', base: null, bundle: { converter: exportConverter() } },
      zip.sink,
      signal,
    )
    zip.finish()
    await uploading
    await db
      .update(exportsTable)
      .set({
        status: 'ready',
        sizeBytes: size,
        manifest,
        manifestSha256: createHash('sha256').update(manifestBytes(manifest)).digest('hex'),
        finishedAt: new Date(),
        expiresAt: new Date(now.getTime() + RETENTION_DAYS * DAY_MS),
      })
      .where(eq(exportsTable.id, exportId))
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    try {
      zip.stream.destroy()
      counted.destroy()
      await uploading.catch(() => undefined)
      await store.delete(key, signal).catch(() => undefined)
    } finally {
      await db
        .update(exportsTable)
        .set({ status: 'failed', error: message, finishedAt: new Date() })
        .where(eq(exportsTable.id, exportId))
    }
    return { ok: false, error: message }
  }
}

export const exportsBuildJob = defineJob<{ exportId: string }>({
  name: JOB_NAMES.EXPORTS_BUILD,
  dedupKey: (p) => `exports.build:${p.exportId}`,
  handler: async (payload, ctx) => {
    const result = await buildBusinessExport(
      ctx.root,
      getObjectStore(),
      payload.exportId,
      ctx.signal,
    )
    return result.ok ? ok(undefined) : failKeepingWrites(result.error)
  },
})

export const exportsPruneJob = defineJob<{ at?: string }>({
  name: JOB_NAMES.EXPORTS_PRUNE,
  intervalSeconds: DAY_MS / 1000,
  dedupKey: (p) => `exports.prune:${(p.at ?? new Date().toISOString()).slice(0, 10)}`,
  handler: async (_payload, ctx) => {
    await pruneExpiredExports(ctx.root, getObjectStore(), new Date(), ctx.signal)
    return ok(undefined)
  },
})

const MINUTE_CHARS = 16
const MINUTE_SECONDS = 60

export const exportsPickupJob = defineJob<{ at?: string }>({
  name: JOB_NAMES.EXPORTS_PICKUP,
  intervalSeconds: MINUTE_SECONDS,
  dedupKey: (p) =>
    `${JOB_NAMES.EXPORTS_PICKUP}:${(p.at ?? new Date().toISOString()).slice(0, MINUTE_CHARS)}`,
  handler: async (p, ctx) => {
    const waiting = await ctx.db
      .select({ id: exportsTable.id })
      .from(exportsTable)
      .where(and(eq(exportsTable.kind, 'business'), eq(exportsTable.status, 'queued')))
    for (const row of waiting) await enqueue(exportsBuildJob, { exportId: row.id }, ctx.signal)
    const asked = await ctx.db
      .select({ id: exportTargets.id })
      .from(exportTargets)
      .where(and(eq(exportTargets.isActive, true), isNotNull(exportTargets.runRequestedAt)))
      .limit(1)
    if (asked.length > 0) {
      const at = p.at ?? new Date().toISOString()
      await enqueue(exportsIncrementalJob, { at, manual: true }, ctx.signal)
    }
    return ok(undefined)
  },
})
