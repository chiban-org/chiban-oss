import type { AbutterParams } from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { projectionParamsFor } from '@/features/abutters/projection/paramsFor'
import { projectAcross } from '@/features/abutters/projection/projectAcross'
import { PROBE_SCENARIOS } from '@/features/abutters/projection/testKit'
import { isAdjacent, isCaptured } from '@/features/abutters/verdicts'
import { loadPack } from '@/features/packs/loadPack'
import { type FieldProbe, probe } from '@/features/packs/probes/probe'

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
    captured: [49.5, 50, 55].map((ft) => isCaptured(ft, params.captureRadiusFt)),
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

function paramsProbe(mutate: (p: AbutterParams) => AbutterParams): FieldProbe {
  return probe<AbutterParams>({
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
    'abutter_params.alongDepthFt': paramsProbe((p) => ({ ...p, alongDepthFt: 10 })),
  }
}
