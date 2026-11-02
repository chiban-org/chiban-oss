import type { DbOrTx } from '@/db/client'
import { LAYER_KEYS, type LayerKey } from '@/features/gis/exceptionKinds'
import { getLayerStatus, type LayerStatus } from '@/features/gis/layerStatus'

export async function allLayerStatuses(
  db: DbOrTx,
  now: Date,
  signal: AbortSignal,
): Promise<Record<LayerKey, LayerStatus>> {
  const statuses: Partial<Record<LayerKey, LayerStatus>> = {}
  for (const key of LAYER_KEYS) statuses[key] = await getLayerStatus(db, key, now, signal)
  return statuses as Record<LayerKey, LayerStatus>
}

export function layerUsable(status: LayerStatus): boolean {
  return status.state === 'fresh' || status.state === 'stale'
}
