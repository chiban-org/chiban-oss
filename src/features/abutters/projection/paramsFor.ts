import type { AbutterParams } from '@packs/nh/schema'
import type { ProjectionParams } from '@/features/abutters/projection/types'

export function projectionParamsFor(
  params: AbutterParams,
  assumedRightOfWayFt: number,
): ProjectionParams {
  return {
    simplifyToleranceFt: params.simplifyToleranceFt,
    cornerTurnDeg: params.cornerTurnDeg,
    lineFrontageToleranceFt: assumedRightOfWayFt,
    areaFrontageToleranceFt: params.areaFrontageToleranceFt,
    parallelToleranceDeg: params.parallelToleranceDeg,
    onFeatureToleranceFt: params.onFeatureToleranceFt,
    maxCrossingFt: params.maxCrossingFt,
    alongDepthFt: params.alongDepthFt,
  }
}
