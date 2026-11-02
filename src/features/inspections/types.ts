import type { InspectionChannel } from '@/db/schema'
import type { CivilDate } from '@/types/civilDate'

export interface InspectableType {
  checklistVersionId: string
  inspectionType: string
  label: string
  final: boolean
}

export interface RequestInspectionInput {
  applicationId: string
  checklistVersionId: string
  channel: InspectionChannel
  preferredDate?: CivilDate
  contactName: string
  contactPhone?: string
  accessNotes?: string
  reinspectionOf?: string
}

export type RequestInspectionError =
  | 'not_found'
  | 'forbidden'
  | 'not_issued'
  | 'permit_suspended'
  | 'not_a_pinned_checklist'
  | 'portal_requests_disabled'
  | 'reinspection_not_failed'
  | 'reinspection_open'
  | 'preferred_date_unavailable'

export const PORTAL_PARTY_ROLES = ['applicant', 'owner', 'agent', 'contractor'] as const
