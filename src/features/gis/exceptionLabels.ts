import type { ImportExceptionKind } from '@/features/gis/exceptionKinds'
import { words } from '@/lib/words'

export const EXCEPTION_STATUSES = ['open', 'accepted', 'dismissed', 'resolved_by_rerun'] as const

export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number]

export const EXCEPTION_STATUS_LABELS: ReadonlyMap<ExceptionStatus, string> = new Map([
  ['open', 'Open'],
  ['accepted', 'Accepted'],
  ['dismissed', 'Dismissed'],
  ['resolved_by_rerun', 'Cleared by a later import'],
])

export const EXCEPTION_KIND_LABELS: ReadonlyMap<ImportExceptionKind, string> = new Map([
  ['invalid_geometry', 'Shape is not valid'],
  ['missing_geometry', 'No shape'],
  ['missing_required_field', 'Required field is empty'],
  ['id_format_mismatch', 'Parcel ID in the wrong format'],
  ['id_numeric_lost_zeros', 'Parcel ID lost its leading zeros'],
  ['id_resolves_to_retired', 'Parcel ID belongs to a retired parcel'],
  ['alias_conflict', 'Parcel ID belongs to another parcel'],
  ['alias_conflicts_override', 'Parcel ID is set by an override'],
  ['owner_changed', 'Owner changed'],
  ['missing_from_layer', 'Missing from the new layer'],
  ['cama_parcel_unknown', 'Owner record matches no parcel'],
])

export function exceptionKindLabel(kind: string): string {
  return EXCEPTION_KIND_LABELS.get(kind as ImportExceptionKind) ?? words(kind)
}
