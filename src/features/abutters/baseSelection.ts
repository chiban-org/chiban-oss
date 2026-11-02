import type { Tx } from '@/db/client'
import { adjacentParcels } from '@/features/abutters/adjacency'
import { allLayerStatuses, layerUsable } from '@/features/abutters/layerUse'
import type {
  Candidate,
  CandidateReason,
  CandidateSelection,
  StrategyInput,
} from '@/features/abutters/types'

export function mergeCandidates(
  staff: Candidate[],
  adjacent: string[],
  across: Candidate[],
): Candidate[] {
  const ordered = new Map<string, CandidateReason[]>()
  const add = (parcelId: string, reasons: CandidateReason[]) => {
    ordered.set(parcelId, [...(ordered.get(parcelId) ?? []), ...reasons])
  }
  for (const c of staff) add(c.parcelId, c.reasons)
  for (const parcelId of adjacent) add(parcelId, [{ kind: 'adjacent' }])
  for (const c of across) add(c.parcelId, c.reasons)
  return [...ordered.entries()].map(([parcelId, reasons]) => ({ parcelId, reasons }))
}

export function staffCandidates(input: StrategyInput): Candidate[] {
  return input.staffSelections.map((s) => ({
    parcelId: s.parcelId,
    reasons: [{ kind: 'staff_selected', crossing: s.crossing, note: s.note, by: s.by }],
  }))
}

export async function selectAdjacency(
  tx: Tx,
  input: StrategyInput,
  toleranceFt: number,
  signal: AbortSignal,
): Promise<CandidateSelection> {
  const layers = await allLayerStatuses(tx, input.now, signal)
  if (!layerUsable(layers.parcels)) {
    return {
      candidates: [],
      layers,
      incomplete: [
        {
          code: 'parcel_layer_unavailable',
          detail: 'The parcel layer has no usable import, so no abutters can be selected.',
        },
      ],
      diagnostics: null,
    }
  }
  const adjacent = await adjacentParcels(tx, input.applicantParcelIds, toleranceFt, signal)
  return {
    candidates: mergeCandidates(staffCandidates(input), adjacent, []),
    layers,
    incomplete: [],
    diagnostics: { adjacent: adjacent.length },
  }
}
