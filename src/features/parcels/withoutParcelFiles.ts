import type { ParcelHistory } from '@/features/parcels/parcelHistory'

export function withoutParcelFiles(history: ParcelHistory): ParcelHistory {
  return {
    ...history,
    own: history.own.filter((r) => r.parcelFile !== true),
    ancestral: history.ancestral
      .map((group) => ({ ...group, records: group.records.filter((r) => r.parcelFile !== true) }))
      .filter((group) => group.records.length > 0),
  }
}
