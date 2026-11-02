import type { Tx } from '@/db/client'
import type { RecipientRole } from '@/features/abutters/roles'
import type { BoardSettingsBody } from '@/features/boards/boardSettingsSchema'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import type { LayerStatus } from '@/features/gis/layerStatus'

export type CrossingKind = 'street' | 'stream'

export type CandidateReason =
  | { kind: 'adjacent' }
  | { kind: 'staff_selected'; crossing: CrossingKind; note: string; by: string }
  | { kind: 'across_between_points'; featureId: string; featureName: string | null }
  | { kind: 'across_within_capture'; featureId: string; distanceFt: number }

export interface Candidate {
  parcelId: string
  reasons: CandidateReason[]
}

export const INCOMPLETE_CODES = [
  'parcel_layer_unavailable',
  'crossing_layers_unavailable',
  'projection_disabled',
  'crossing_too_wide',
  'no_property_across',
  'owner_missing',
  'address_missing',
  'condo_roster_missing',
  'park_tenants_undecided',
  'roster_never_reviewed',
  'regional_contacts_missing',
  'des_contact_missing',
  'determination_missing',
  'applicant_parcel_unmapped',
] as const

export const CROSSING_CODES: readonly IncompleteCode[] = [
  'projection_disabled',
  'crossing_layers_unavailable',
  'crossing_too_wide',
  'no_property_across',
]

export type IncompleteCode = (typeof INCOMPLETE_CODES)[number]

export interface IncompleteReason {
  code: IncompleteCode
  detail: string
  parcelId?: string
  role?: RecipientRole
}

export interface StaffSelection {
  parcelId: string
  crossing: CrossingKind
  note: string
  by: string
}

export interface CandidateSelection {
  candidates: Candidate[]
  layers: Record<LayerKey, LayerStatus>
  incomplete: IncompleteReason[]
  diagnostics: unknown
}

export interface StrategyInput {
  applicationId: string
  applicantParcelIds: string[]
  staffSelections: StaffSelection[]
  crossingsAttested: boolean
  settings: BoardSettingsBody['abutters']
  now: Date
}

export interface AbutterStrategy {
  key: string
  version: number
  select(tx: Tx, input: StrategyInput, signal: AbortSignal): Promise<CandidateSelection>
}
