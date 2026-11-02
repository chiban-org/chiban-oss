import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { gisLayers } from '@/db/schema'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import { getTownSettings } from '@/features/town/settings'
import { daysBetween, todayInTimeZone } from '@/types/civilDate'

export type LayerState = 'not_configured' | 'never_imported' | 'import_failed' | 'stale' | 'fresh'

export interface LayerStatus {
  key: LayerKey
  state: LayerState
  lastSuccessAt: string | null
  lastFailureAt: string | null
  ageDays: number | null
  staleAfterDays: number
}

const FALLBACK_TIME_ZONE = 'UTC'

export async function getLayerStatus(
  db: DbOrTx,
  key: LayerKey,
  now: Date,
  signal: AbortSignal,
): Promise<LayerStatus> {
  signal.throwIfAborted()
  const [layer] = await db.select().from(gisLayers).where(eq(gisLayers.key, key))
  const town = await getTownSettings(db, signal)
  const tz = town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
  const success = layer?.lastSuccessAt ?? null
  const failure = layer?.lastFailureAt ?? null
  const staleAfterDays = layer?.staleAfterDays ?? 90
  const ageDays =
    success === null ? null : daysBetween(todayInTimeZone(tz, success), todayInTimeZone(tz, now))
  const base = {
    key,
    lastSuccessAt: success?.toISOString() ?? null,
    lastFailureAt: failure?.toISOString() ?? null,
    ageDays,
    staleAfterDays,
  }
  if (
    layer === undefined ||
    (layer.required !== true && layer.adapter === null && success === null && failure === null)
  ) {
    return { ...base, state: 'not_configured' }
  }
  if (success === null && failure === null) return { ...base, state: 'never_imported' }
  if (failure !== null && (success === null || failure > success)) {
    return { ...base, state: 'import_failed' }
  }
  if (ageDays !== null && ageDays > staleAfterDays) return { ...base, state: 'stale' }
  return { ...base, state: 'fresh' }
}
