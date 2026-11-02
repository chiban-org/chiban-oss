import type { Tx } from '@/db/client'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import type { ImportActor } from '@/features/gis/import/types'

export interface ImportContext {
  tx: Tx
  runId: string
  layerKey: LayerKey
  actor: ImportActor
  signal: AbortSignal
}
