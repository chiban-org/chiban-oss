export const CUTOVER_BASE_COLUMNS = [
  'legacy_number',
  'application_type_key',
  'parcel_id_format',
  'parcel_id',
  'project_title',
  'applicant_name',
  'applicant_email',
  'owner_name',
  'contractor_name',
  'contractor_email',
  'contractor_license_number',
  'state',
  'received_date',
  'completed_date',
  'decided_on',
  'issued_on',
  'fees_paid_in_prior_system',
  'prior_receipt_ref',
] as const

export const CUTOVER_REQUIRED_COLUMNS = [
  'legacy_number',
  'application_type_key',
  'parcel_id',
  'state',
  'received_date',
] as const

export const CUTOVER_STATES = ['submitted', 'under_review', 'decided', 'issued'] as const
export type CutoverState = (typeof CUTOVER_STATES)[number]
