import { and, isNotNull } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import { LAYER_KEYS, type LayerKey } from '@/features/gis/exceptionKinds'
import { refreshLayer } from '@/features/gis/refreshLayer'
import { err, ok } from '@/types/result'
import { defineJob, enqueue } from './defineJob'

const MS_PER_HOUR = 3_600_000
const SCHEDULER_INTERVAL_SECONDS = 3600
const SYSTEM_ACTOR = { kind: 'system', job: JOB_NAMES.GIS_REFRESH_LAYER } as const

interface RefreshPayload {
  layerKey: LayerKey
}

export async function dueLayerKeys(db: Db, now: Date, signal: AbortSignal): Promise<LayerKey[]> {
  signal.throwIfAborted()
  const layers = await db
    .select()
    .from(gisLayers)
    .where(and(isNotNull(gisLayers.adapter), isNotNull(gisLayers.sourceUrl)))
  return layers
    .filter((l) => l.adapter === 'esri_rest' || l.adapter === 'axisgis')
    .filter(
      (l) =>
        l.lastSuccessAt === null ||
        now.getTime() - l.lastSuccessAt.getTime() >= l.refreshIntervalHours * MS_PER_HOUR,
    )
    .map((l) => l.key)
}

export function makeGisRefreshLayerJob(fetchImpl: typeof fetch) {
  return defineJob<RefreshPayload>({
    name: JOB_NAMES.GIS_REFRESH_LAYER,
    dedupKey: (p) => `${p.layerKey}:${Math.floor(Date.now() / MS_PER_HOUR)}`,
    handler: async (payload, ctx) => {
      if (!LAYER_KEYS.includes(payload.layerKey)) return err('unknown layer')
      const result = await refreshLayer(
        ctx.db,
        SYSTEM_ACTOR,
        payload.layerKey,
        { fetch: fetchImpl },
        ctx.signal,
      )
      if (result.ok || result.error === 'import_failed') return ok(undefined)
      return err(result.error)
    },
  })
}

export const gisRefreshLayerJob = makeGisRefreshLayerJob((input, init) => fetch(input, init))

export const gisScheduleRefreshesJob = defineJob<Record<string, never>>({
  name: JOB_NAMES.GIS_SCHEDULE_REFRESHES,
  intervalSeconds: SCHEDULER_INTERVAL_SECONDS,
  dedupKey: () => `schedule:${Math.floor(Date.now() / MS_PER_HOUR)}`,
  handler: async (_payload, ctx) => {
    for (const layerKey of await dueLayerKeys(ctx.db, new Date(), ctx.signal)) {
      await enqueue(gisRefreshLayerJob, { layerKey }, ctx.signal)
    }
    return ok(undefined)
  },
})
