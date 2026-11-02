import type { Pt } from '@/features/abutters/projection/vec'

export type { Pt }

export interface CrossingFeature {
  id: string
  layer: 'roads' | 'water'
  name: string | null
  geometry: { kind: 'line'; paths: Pt[][] } | { kind: 'area'; rings: Pt[][] }
}

export interface OtherParcel {
  parcelId: string
  rings: Pt[][]
}

export interface ProjectionParams {
  simplifyToleranceFt: number
  cornerTurnDeg: number
  lineFrontageToleranceFt: number
  areaFrontageToleranceFt: number
  parallelToleranceDeg: number
  onFeatureToleranceFt: number
  maxCrossingFt: number
  alongDepthFt: number
}

export interface ProjectedPoint {
  featureId: string
  corner: Pt
  point: Pt
  direction: Pt
  hitParcelId: string
}

export interface ProjectionFlag {
  kind: 'crossing_too_wide' | 'no_property_across'
  featureId: string
  corner: Pt
}

export interface ProjectionResult {
  points: ProjectedPoint[]
  regions: Pt[][]
  flags: ProjectionFlag[]
}
