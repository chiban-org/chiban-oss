import { and, inArray, isNull } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { parcels } from '@/db/schema'
import { adjacentParcels } from '@/features/abutters/adjacency'
import { allLayerStatuses, layerUsable } from '@/features/abutters/layerUse'
import type {
  Candidate,
  CandidateReason,
  CandidateSelection,
  IncompleteReason,
  StrategyInput,
} from '@/features/abutters/types'
import { displayIdsFor } from '@/features/parcels/displayId'

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

async function unmappedApplicantParcels(
  tx: Tx,
  applicantParcelIds: string[],
): Promise<IncompleteReason[]> {
  if (applicantParcelIds.length === 0) return []
  const rows = await tx
    .select({ id: parcels.id })
    .from(parcels)
    .where(and(inArray(parcels.id, applicantParcelIds), isNull(parcels.geom)))
  const labels = await displayIdsFor(
    tx,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({
    code: 'applicant_parcel_unmapped',
    parcelId: r.id,
    detail: `Parcel ${labels.get(r.id) ?? 'on this application'} has no shape on the parcel layer, so its neighbors could not be found. Import the parcel layer with its shape, then draw the list again.`,
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
    incomplete: await unmappedApplicantParcels(tx, input.applicantParcelIds),
    diagnostics: { adjacent: adjacent.length },
  }
}
