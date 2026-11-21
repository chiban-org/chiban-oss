import { ME_ABUTTER_PARAMS } from '@packs/me/abutters/params'
import type { Tx } from '@/db/client'
import { bufferedParcels } from '@/features/abutters/adjacency'
import {
  mergeCandidates,
  selectAdjacency,
  staffCandidates,
} from '@/features/abutters/baseSelection'
import { registerAbutterStrategy } from '@/features/abutters/registry'
import { effectiveBufferFt } from '@/features/abutters/townBuffer'
import type { AbutterStrategy, Candidate, StrategyInput } from '@/features/abutters/types'
import type { AbutterParams } from '@/features/packs/schema'

async function bufferCandidates(
  tx: Tx,
  input: StrategyInput,
  params: AbutterParams,
  signal: AbortSignal,
): Promise<Candidate[]> {
  const bufferFt = effectiveBufferFt(input.settings.bufferFt, params)
  if (bufferFt === null || bufferFt <= 0) return []
  const found = await bufferedParcels(tx, input.applicantParcelIds, bufferFt, signal)
  return found.map((parcelId) => ({ parcelId, reasons: [{ kind: 'within_buffer', bufferFt }] }))
}

export function createMeStrategy(params: AbutterParams): AbutterStrategy {
  return {
    key: params.key,
    version: params.version,
    async select(tx, input, signal) {
      const base = await selectAdjacency(tx, input, params.adjacencyToleranceFt, signal)
      if (base.incomplete.some((i) => i.code === 'parcel_layer_unavailable')) return base
      const applicant = new Set(input.applicantParcelIds)
      const staff = staffCandidates(input).filter((c) => !applicant.has(c.parcelId))
      const adjacent = base.candidates
        .filter((c) => c.reasons.some((r) => r.kind === 'adjacent'))
        .map((c) => c.parcelId)
      const buffered = await bufferCandidates(tx, input, params, signal)
      return {
        ...base,
        candidates: mergeCandidates(staff, adjacent, buffered),
        diagnostics: { adjacent: adjacent.length, buffered: buffered.length },
      }
    },
  }
}

registerAbutterStrategy(createMeStrategy(ME_ABUTTER_PARAMS))
