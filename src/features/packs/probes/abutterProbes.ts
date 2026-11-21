import { AppError, ErrorIds } from '@/constants/errorIds'
import { projectionParamsFor } from '@/features/abutters/projection/paramsFor'
import { projectAcross } from '@/features/abutters/projection/projectAcross'
import { PROBE_SCENARIOS } from '@/features/abutters/projection/testKit'
import {
  bufferAboveMaxMessage,
  bufferWithinMax,
  effectiveBufferFt,
} from '@/features/abutters/townBuffer'
import { isAdjacent, isCaptured } from '@/features/abutters/verdicts'
import { loadPack } from '@/features/packs/loadPack'
import { type FieldProbe, probe } from '@/features/packs/probes/probe'
import type { AbutterParams } from '@/features/packs/schema'

const ASSUMED_RIGHT_OF_WAY_FT = 50

function observeParams(params: AbutterParams): unknown {
  return {
    summary: {
      key: params.key,
      version: params.version,
      citation: params.citation,
      label: params.tolerancesLabel,
    },
    adjacent: [0, 0.5, 1, 3].map((ft) => isAdjacent(ft, params.adjacencyToleranceFt)),
    captured: [49.5, 50, 55].map((ft) =>
      params.captureRadiusFt === null ? null : isCaptured(ft, params.captureRadiusFt),
    ),
    townBuffer: {
      unset: effectiveBufferFt(undefined, params),
      accepted: [100, 400, 900].map((ft) => bufferWithinMax(ft, params)),
      refusal: params.townBuffer === undefined ? null : bufferAboveMaxMessage(params.townBuffer),
    },
    scenarios: PROBE_SCENARIOS.map((scenario) =>
      projectAcross({
        applicantRings: scenario.applicantRings,
        others: scenario.others,
        features: scenario.features,
        params: projectionParamsFor(params, ASSUMED_RIGHT_OF_WAY_FT),
      }),
    ),
  }
}

function paramsProbe(
  mutate: (p: AbutterParams) => AbutterParams,
  prepare?: (p: AbutterParams) => AbutterParams,
): FieldProbe {
  return probe<AbutterParams>({
    ...(prepare === undefined ? {} : { prepare }),
    base: () => {
      const found = loadPack().abutterParams[0]
      if (found === undefined) {
        throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'the pack declares no abutter parameters')
      }
      return found
    },
    mutate,
    observe: observeParams,
  })
}

export function abutterProbes(): Record<string, FieldProbe> {
  return {
    'abutter_params.key': paramsProbe((p) => ({ ...p, key: 'changed' })),
    'abutter_params.version': paramsProbe((p) => ({ ...p, version: p.version + 1 })),
    'abutter_params.citation.label': paramsProbe((p) => ({
      ...p,
      citation: { ...p.citation, label: 'Changed' },
    })),
    'abutter_params.citation.url': paramsProbe((p) => ({
      ...p,
      citation: { ...p.citation, url: 'https://example.test/c' },
    })),
    'abutter_params.tolerancesLabel': paramsProbe((p) => ({ ...p, tolerancesLabel: 'Changed' })),
    'abutter_params.captureRadiusFt': paramsProbe((p) => ({ ...p, captureRadiusFt: 40 })),
    'abutter_params.adjacencyToleranceFt': paramsProbe((p) => ({ ...p, adjacencyToleranceFt: 4 })),
    'abutter_params.simplifyToleranceFt': paramsProbe((p) => ({ ...p, simplifyToleranceFt: 10 })),
    'abutter_params.cornerTurnDeg': paramsProbe((p) => ({ ...p, cornerTurnDeg: 5 })),
    'abutter_params.areaFrontageToleranceFt': paramsProbe((p) => ({
      ...p,
      areaFrontageToleranceFt: 1,
    })),
    'abutter_params.parallelToleranceDeg': paramsProbe((p) => ({ ...p, parallelToleranceDeg: 10 })),
    'abutter_params.onFeatureToleranceFt': paramsProbe((p) => ({
      ...p,
      onFeatureToleranceFt: 0.1,
    })),
    'abutter_params.maxCrossingFt': paramsProbe((p) => ({ ...p, maxCrossingFt: 700 })),
    'abutter_params.townBuffer.defaultFt': paramsProbe(
      (p) => ({ ...p, townBuffer: { defaultFt: 450, maxFt: 1000 } }),
      (p) => ({ ...p, townBuffer: { defaultFt: 300, maxFt: 1000 } }),
    ),
    'abutter_params.townBuffer.maxFt': paramsProbe(
      (p) => ({ ...p, townBuffer: { defaultFt: 300, maxFt: 800 } }),
      (p) => ({ ...p, townBuffer: { defaultFt: 300, maxFt: 300 } }),
    ),
    'abutter_params.townBuffer.maxSetBy': paramsProbe(
      (p) => ({ ...p, townBuffer: { defaultFt: 300, maxFt: 1000, maxSetBy: 'chiban' } }),
      (p) => ({ ...p, townBuffer: { defaultFt: 300, maxFt: 1000 } }),
    ),
    'abutter_params.alongDepthFt': paramsProbe((p) => ({ ...p, alongDepthFt: 10 })),
  }
}
