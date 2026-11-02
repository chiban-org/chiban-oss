import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers, importRuns } from '@/db/schema'
import { readAxisGisLayer } from '@/features/gis/adapters/axisGis'
import { readEsriLayer } from '@/features/gis/adapters/esriRest'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import { hashJson } from '@/features/gis/import/hash'
import { runImport } from '@/features/gis/import/runImport'
import type { ImportActor, ImportError, ImportRunReport } from '@/features/gis/import/types'
import { err, type Result } from '@/types/result'

export interface RefreshDeps {
  fetch: typeof fetch
}

async function recordSourceFailure(
  db: Db,
  actor: ImportActor,
  key: LayerKey,
  adapter: string,
  message: string,
): Promise<void> {
  const now = new Date()
  await db.insert(importRuns).values({
    layerKey: key,
    adapter,
    actorUserId: actor.kind === 'user' ? actor.userId : null,
    actorJob: actor.kind === 'system' ? actor.job : null,
    inputHash: hashJson(null),
    status: 'failed',
    finishedAt: now,
    error: message,
  })
  await db
    .update(gisLayers)
    .set({ lastFailureAt: now, lastError: message })
    .where(eq(gisLayers.key, key))
}

export async function refreshLayer(
  db: Db,
  actor: ImportActor,
  key: LayerKey,
  deps: RefreshDeps,
  signal: AbortSignal,
): Promise<Result<ImportRunReport, ImportError>> {
  signal.throwIfAborted()
  const [layer] = await db.select().from(gisLayers).where(eq(gisLayers.key, key))
  const adapter = layer?.adapter
  if (layer?.sourceUrl == null || (adapter !== 'esri_rest' && adapter !== 'axisgis')) {
    return err('layer_not_configured')
  }
  const read =
    adapter === 'axisgis'
      ? await readAxisGisLayer({ layerUrl: layer.sourceUrl }, deps, signal)
      : await readEsriLayer(layer.sourceUrl, deps, signal)
  if (!read.ok) {
    await recordSourceFailure(db, actor, key, adapter, `${read.error.kind}: ${read.error.detail}`)
    return err('import_failed')
  }
  return await runImport(
    db,
    actor,
    { layerKey: key, adapter, features: read.value, fullLayer: true },
    signal,
  )
}
