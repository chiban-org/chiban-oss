import type { ImportExceptionKind, LayerKey } from '@/features/gis/exceptionKinds'

export interface SourceFeature {
  rowRef: string
  properties: Record<string, string | number | boolean | null>
  geometry: GeoJSON.Geometry | null
}

export type ImportActor = { kind: 'user'; userId: string } | { kind: 'system'; job: string }

export interface ImportInput {
  layerKey: LayerKey
  adapter: string
  features: SourceFeature[]
  fullLayer: boolean
}

export interface ImportRunReport {
  runId: string
  layerKey: string
  status: 'succeeded'
  countSourceFeatures: number
  countIn: number
  countCreated: number
  countApplied: number
  countUnchanged: number
  countExcepted: number
  countMergedParts: number
  countMissingFromLayer: number
  exceptionsByKind: Partial<Record<ImportExceptionKind, number>>
  startedAt: string
  finishedAt: string
}

export type ImportError =
  | 'forbidden'
  | 'import_in_progress'
  | 'layer_not_configured'
  | 'invalid_mapping'
  | 'import_failed'

export type RowOutcome = 'created' | 'applied' | 'unchanged' | 'excepted'
