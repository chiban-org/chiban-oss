import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import type { AbutterParams } from '@packs/nh/schema'
import type { Tx } from '@/db/client'
import { mergeCandidates, selectAdjacency } from '@/features/abutters/baseSelection'
import { loadCrossingInputs } from '@/features/abutters/crossingInputs'
import { layerUsable } from '@/features/abutters/layerUse'
import { projectionParamsFor } from '@/features/abutters/projection/paramsFor'
import { projectAcross } from '@/features/abutters/projection/projectAcross'
import type { ProjectionResult } from '@/features/abutters/projection/types'
import { registerAbutterStrategy } from '@/features/abutters/registry'
import { selectAcross } from '@/features/abutters/selectAcross'
import type {
  AbutterStrategy,
  CandidateSelection,
  IncompleteReason,
  StrategyInput,
} from '@/features/abutters/types'

const NEARBY_MARGIN_FT = 50

function flagReasons(
  result: ProjectionResult,
  names: Map<string, string | null>,
): IncompleteReason[] {
  return result.flags.map((flag) => {
    const name = names.get(flag.featureId) ?? 'the street or stream'
    return flag.kind === 'crossing_too_wide'
      ? {
          code: 'crossing_too_wide',
          detail: `${name} is wider than the board's crossing limit, so parcels across it need review by staff.`,
        }
      : {
          code: 'no_property_across',
          detail: `No property was found across ${name} from one corner, so parcels across it need review by staff.`,
        }
  })
}

async function selectWithProjection(
  tx: Tx,
  input: StrategyInput,
  base: CandidateSelection,
  params: AbutterParams,
  signal: AbortSignal,
): Promise<CandidateSelection> {
  const radius = params.maxCrossingFt + params.captureRadiusFt + NEARBY_MARGIN_FT
  const inputs = await loadCrossingInputs(tx, input.applicantParcelIds, radius, signal)
  const result = projectAcross({
    applicantRings: inputs.applicantRings,
    others: inputs.others,
    features: inputs.features,
    params: projectionParamsFor(params, input.settings.assumedRightOfWayFt),
  })
  const across = await selectAcross(
    tx,
    result,
    input.applicantParcelIds,
    params.captureRadiusFt,
    inputs.features,
    signal,
  )
  const names = new Map(inputs.features.map((f) => [f.id, f.name]))
  const adjacent = base.candidates
    .filter((c) => c.reasons.some((r) => r.kind === 'adjacent'))
    .map((c) => c.parcelId)
  const staff = base.candidates.filter((c) => c.reasons.some((r) => r.kind === 'staff_selected'))
  return {
    ...base,
    candidates: mergeCandidates(
      staff.map((c) => ({ ...c, reasons: c.reasons.filter((r) => r.kind === 'staff_selected') })),
      adjacent,
      across,
    ),
    incomplete: [
      ...base.incomplete,
      ...(input.crossingsAttested ? [] : flagReasons(result, names)),
    ],
    diagnostics: { points: result.points.length, regions: result.regions.length },
  }
}

export function createNhStrategy(params: AbutterParams): AbutterStrategy {
  return {
    key: params.key,
    version: params.version,
    async select(tx, input, signal) {
      const base = await selectAdjacency(tx, input, params.adjacencyToleranceFt, signal)
      if (base.incomplete.some((i) => i.code === 'parcel_layer_unavailable')) return base
      if (!input.settings.projectionEnabled) {
        return input.crossingsAttested
          ? base
          : {
              ...base,
              incomplete: [
                ...base.incomplete,
                {
                  code: 'projection_disabled',
                  detail:
                    'Projection across streets and streams is turned off for this town, so only touching parcels are listed.',
                },
              ],
            }
      }
      if (!layerUsable(base.layers.roads) || !layerUsable(base.layers.water)) {
        return input.crossingsAttested
          ? base
          : {
              ...base,
              incomplete: [
                ...base.incomplete,
                {
                  code: 'crossing_layers_unavailable',
                  detail:
                    'The road or water layer has no usable import, so parcels across a street or stream were not found.',
                },
              ],
            }
      }
      return await selectWithProjection(tx, input, base, params, signal)
    },
  }
}

registerAbutterStrategy(createNhStrategy(NH_ABUTTER_PARAMS))
