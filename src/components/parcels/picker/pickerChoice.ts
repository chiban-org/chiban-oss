import { normalizeId } from '@/features/parcels/idFormats'
import type { PickedParcel } from '@/features/parcels/parcelPick'

export type PickerChoice = { kind: 'parcel'; parcel: PickedParcel } | { kind: 'raw'; value: string }

export type ParcelSearch = (q: string, signal: AbortSignal) => Promise<PickedParcel[]>

export const MIN_PICK_QUERY = 2

export interface PickerFieldProps {
  name: string
  label: string
  hint?: string | undefined
  required?: boolean
  allowUnknown?: boolean
}

export function choiceValue(choice: PickerChoice): string {
  return choice.kind === 'parcel' ? choice.parcel.parcelId : choice.value
}

export function choiceTitle(choice: PickerChoice): string {
  if (choice.kind === 'raw') return choice.value
  return choice.parcel.displayId ?? 'No map-lot ID'
}

export function choiceDetail(choice: PickerChoice): string {
  if (choice.kind === 'raw') return 'Not in the parcel layer'
  const { siteAddress, ownerName } = choice.parcel
  return [siteAddress ?? 'Address not on file', ownerName].filter((s) => s !== null).join(', ')
}

function exactlyFound(hits: PickedParcel[], query: string): boolean {
  const wanted = normalizeId(query)
  return hits.some((h) => h.displayId !== null && normalizeId(h.displayId) === wanted)
}

export function optionsFor(
  hits: PickedParcel[],
  query: string,
  allowUnknown: boolean,
): PickerChoice[] {
  const parcels = hits.map((parcel): PickerChoice => ({ kind: 'parcel', parcel }))
  const raw = query.trim()
  if (!allowUnknown || raw === '' || /[\s,;]/.test(raw) || exactlyFound(hits, raw)) return parcels
  return [...parcels, { kind: 'raw', value: raw }]
}

export function movedIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'ArrowDown') return current + 1 >= count ? 0 : current + 1
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1
  return null
}
