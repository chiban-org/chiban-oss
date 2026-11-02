import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { gisLayers, importRuns, parcelIdFormats } from '@/db/schema'
import { requireCapability } from '@/features/authz/capabilities'
import { camaMappingSchema } from '@/features/cama/mapping'
import { type ImportExceptionKind, LAYER_ADAPTERS } from '@/features/gis/exceptionKinds'
import { applyFeatureRow, prepareFeatureRows } from '@/features/gis/import/applyFeatureRow'
import { applyParcelRow, type RowResult } from '@/features/gis/import/applyParcelRow'
import type { ImportContext } from '@/features/gis/import/context'
import { resolveCleanedExceptions } from '@/features/gis/import/exceptions'
import { hashJson } from '@/features/gis/import/hash'
import { reportMissingFromLayer } from '@/features/gis/import/missingFromLayer'
import { prepareRows } from '@/features/gis/import/prepareRows'
import { processCamaRows } from '@/features/gis/import/processCama'
import type {
  ImportActor,
  ImportError,
  ImportInput,
  ImportRunReport,
} from '@/features/gis/import/types'
import {
  featureMappingSchema,
  layerMappingSchema,
  mappingSchemaFor,
} from '@/features/gis/layerMapping'
import type { IdFormat } from '@/features/parcels/idFormats'
import { retryUnresolvedLinks } from '@/features/parcels/recordLinks'
import { err, ok, type Result } from '@/types/result'

interface Tally {
  created: number
  applied: number
  unchanged: number
  excepted: number
  mergedParts: number
  byKind: Partial<Record<ImportExceptionKind, number>>
}

function tally(t: Tally, r: RowResult): void {
  if (r.outcome === 'created') t.created += 1
  else if (r.outcome === 'applied') t.applied += 1
  else if (r.outcome === 'unchanged') t.unchanged += 1
  else t.excepted += 1
  if (r.kind !== undefined) t.byKind[r.kind] = (t.byKind[r.kind] ?? 0) + 1
}

async function loadFormats(tx: Tx): Promise<Map<string, IdFormat>> {
  const rows = await tx.select().from(parcelIdFormats)
  return new Map(rows.map((r) => [r.key, { key: r.key, kind: r.kind, width: r.width }]))
}

async function processRows(
  ctx: ImportContext,
  input: ImportInput,
  mapping: unknown,
  t: Tally,
): Promise<{ keys: string[]; primaryValues: Set<string>; format: string | null }> {
  if (input.layerKey === 'cama') {
    const parsed = camaMappingSchema.parse(mapping)
    const done = await processCamaRows(
      ctx,
      input.features,
      parsed.id.format,
      await loadFormats(ctx.tx),
    )
    for (const r of done.results) tally(t, r)
    return { keys: done.keys, primaryValues: done.seenIds, format: done.format }
  }
  if (input.layerKey === 'parcels') {
    const parsed = layerMappingSchema.parse(mapping)
    const rows = prepareRows(input.features, parsed, await loadFormats(ctx.tx))
    const primaryValues = new Set<string>()
    for (const row of rows) {
      t.mergedParts += row.geometries.length > 1 ? row.geometries.length - 1 : 0
      if (row.primary !== null) primaryValues.add(row.primary.value)
      tally(t, await applyParcelRow(ctx, row))
    }
    return { keys: rows.map((r) => r.rowKey), primaryValues, format: parsed.primaryId.format }
  }
  const rows = prepareFeatureRows(input.features, featureMappingSchema.parse(mapping))
  for (const row of rows) tally(t, await applyFeatureRow(ctx, row))
  return { keys: rows.map((r) => r.rowKey), primaryValues: new Set(), format: null }
}

async function execute(
  tx: Tx,
  actor: ImportActor,
  input: ImportInput,
  runId: string,
  mapping: unknown,
  signal: AbortSignal,
): Promise<ImportRunReport> {
  const startedAt = new Date()
  await tx.insert(importRuns).values({
    id: runId,
    layerKey: input.layerKey,
    adapter: input.adapter,
    actorUserId: actor.kind === 'user' ? actor.userId : null,
    actorJob: actor.kind === 'system' ? actor.job : null,
    inputHash: hashJson(input.features),
    status: 'running',
    startedAt,
  })
  const ctx: ImportContext = { tx, runId, layerKey: input.layerKey, actor, signal }
  const t: Tally = { created: 0, applied: 0, unchanged: 0, excepted: 0, mergedParts: 0, byKind: {} }
  const processed = await processRows(ctx, input, mapping, t)
  await resolveCleanedExceptions(tx, input.layerKey, runId, processed.keys)
  let missing = 0
  if (input.fullLayer && processed.format !== null) {
    missing = await reportMissingFromLayer(ctx, processed.format, processed.primaryValues)
    if (missing > 0) t.byKind.missing_from_layer = missing
  }
  const finishedAt = new Date()
  const report: ImportRunReport = {
    runId,
    layerKey: input.layerKey,
    status: 'succeeded',
    countSourceFeatures: input.features.length,
    countIn: t.created + t.applied + t.unchanged + t.excepted,
    countCreated: t.created,
    countApplied: t.applied,
    countUnchanged: t.unchanged,
    countExcepted: t.excepted,
    countMergedParts: t.mergedParts,
    countMissingFromLayer: missing,
    exceptionsByKind: t.byKind,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  }
  await tx
    .update(importRuns)
    .set({ status: 'succeeded', finishedAt, report })
    .where(eq(importRuns.id, runId))
  const knownAdapter = LAYER_ADAPTERS.find((a) => a === input.adapter)
  await tx
    .update(gisLayers)
    .set({
      lastSuccessAt: finishedAt,
      lastError: null,
      ...(knownAdapter === undefined ? {} : { adapter: knownAdapter }),
    })
    .where(eq(gisLayers.key, input.layerKey))
  if (input.layerKey === 'parcels') await retryUnresolvedLinks(tx, signal)
  return report
}

class InProgress extends Error {}

async function recordFailure(
  db: Db,
  actor: ImportActor,
  input: ImportInput,
  runId: string,
  message: string,
): Promise<void> {
  const now = new Date()
  await db
    .insert(importRuns)
    .values({
      id: runId,
      layerKey: input.layerKey,
      adapter: input.adapter,
      actorUserId: actor.kind === 'user' ? actor.userId : null,
      actorJob: actor.kind === 'system' ? actor.job : null,
      inputHash: hashJson(input.features),
      status: 'failed',
      finishedAt: now,
      error: message,
    })
    .onConflictDoNothing()
  await db
    .update(gisLayers)
    .set({ lastFailureAt: now, lastError: message })
    .where(eq(gisLayers.key, input.layerKey))
}

export async function runImport(
  db: Db,
  actor: ImportActor,
  input: ImportInput,
  signal: AbortSignal,
): Promise<Result<ImportRunReport, ImportError>> {
  signal.throwIfAborted()
  if (actor.kind === 'user') {
    const allowed = await requireCapability(db, actor.userId, 'gis.import', signal)
    if (!allowed.ok) return err('forbidden')
  }
  const [layer] = await db.select().from(gisLayers).where(eq(gisLayers.key, input.layerKey))
  if (layer === undefined) return err('layer_not_configured')
  const schema = mappingSchemaFor(input.layerKey)
  if (!schema.safeParse(layer.mapping).success) return err('invalid_mapping')
  const runId = randomUUID()
  try {
    const report = await db.transaction(async (tx) => {
      const lock = await tx.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(hashtext(${`gis_import:${input.layerKey}`})) AS locked`,
      )
      if (lock.rows[0]?.locked !== true) throw new InProgress()
      return await execute(tx, actor, input, runId, layer.mapping, signal)
    })
    return ok(report)
  } catch (e) {
    if (e instanceof InProgress) return err('import_in_progress')
    await recordFailure(db, actor, input, runId, e instanceof Error ? e.message : String(e))
    return err('import_failed')
  }
}
