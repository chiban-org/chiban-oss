import type { EnforcementStatus } from '@/db/schema'

export const CASE_STATUS_LABELS: Record<EnforcementStatus, string> = {
  intake: 'Received',
  investigating: 'Under investigation',
  violation_found: 'Violation found',
  no_violation: 'No violation found',
  order_issued: 'Order issued',
  in_court: 'In court',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const CHANNEL_LABELS = {
  anonymous_web: 'Anonymous web form',
  public_named: 'Public form with contact details',
  staff_entry: 'Entered by staff',
} as const

export const PROVISION_KIND_LABELS = {
  zoning_ordinance: 'Zoning ordinance',
  building_code: 'Building code',
  permit_condition: 'Permit condition',
  approved_plan: 'Approved plan',
  board_decision: 'Board decision',
  other_local_ordinance: 'Other local ordinance',
} as const

export const ROLE_LABELS = {
  record_owner: 'Owner of record',
  owner_agent: 'Owner agent',
  taxpayer: 'Taxpayer',
  occupying_tenant: 'Occupying tenant',
  person_in_control: 'Person in control of the property',
  mortgagee_of_record: 'Mortgagee of record',
} as const

export const ROLE_CHECK_LABELS = {
  recipients_listed: 'Recipients listed',
  none_exist: 'None exist',
  same_as_owner: 'Same as the owner',
  owner_not_found: 'Owner could not be found',
} as const

export const SERVICE_METHOD_LABELS = {
  in_hand: 'Handed to the recipient',
  abode: 'Left at the place of abode',
  other_civil_summons_method: 'Other method allowed for a civil summons',
  posting_on_property: 'Posted on the property',
  newspaper_publication: 'Published in a newspaper',
} as const

export const SERVER_ROLE_LABELS = {
  sheriff: 'Sheriff',
  deputy_sheriff: 'Deputy sheriff',
  local_police_officer: 'Local police officer',
  constable: 'Constable',
  other: 'Other',
} as const

export const ORDER_STATUS_LABELS = {
  draft: 'Draft',
  issued: 'Issued, not yet served',
  served: 'Served',
  answered: 'Answered',
  filed_with_court: 'Filed with the court clerk',
  motion_filed: 'Motion to enforce filed',
  judgment: 'Judgment entered',
  annulled: 'Annulled',
  withdrawn: 'Withdrawn',
  complied: 'Complied with',
} as const

export const COURT_STEP_LABELS = {
  filed_with_clerk: 'Filed with the court clerk',
  motion_to_enforce: 'Motion to enforce filed',
  judgment: 'Judgment entered',
} as const

export const JUDGMENT_OUTCOME_LABELS = {
  affirmed: 'Order affirmed',
  modified: 'Order modified',
  annulled: 'Order annulled',
} as const

export const APPEAL_TARGET_LABELS = { order: 'Order', notice: 'Notice of violation' } as const

export const APPEAL_OUTCOME_LABELS = {
  upheld: 'Upheld',
  modified: 'Modified',
  annulled: 'Annulled',
  withdrawn: 'Withdrawn',
} as const

export const COUNSEL_PURPOSE_LABELS = {
  motion_to_enforce: 'Motion to enforce',
  injunction: 'Injunction',
  penalty_action: 'Penalty action',
  other: 'Other',
} as const

export const COUNSEL_OUTCOME_LABELS = {
  motion_filed: 'Motion filed',
  hearing_held: 'Hearing held',
  judgment_for_town: 'Judgment for the town',
  judgment_for_respondent: 'Judgment for the respondent',
  settled: 'Settled',
  dismissed: 'Dismissed',
  withdrawn: 'Withdrawn',
  appealed_to_superior_court: 'Appealed to the superior court',
} as const

export const FINE_KIND_LABELS = {
  civil_penalty: 'Civil penalty',
  costs_and_fees: 'Costs and fees',
  restitution: 'Restitution',
} as const

export const NOTICE_METHOD_LABELS = {
  in_hand: 'Handed to the recipient',
  first_class_mail: 'First class mail',
  certified_mail: 'Certified mail',
  posting: 'Posted on the property',
  email: 'Email',
} as const

export const FINDING_STATUS_LABELS = {
  open: 'Open',
  corrected: 'Corrected',
  withdrawn: 'Withdrawn',
} as const

export const PERIL_LABELS = {
  life: 'Life',
  health: 'Health',
  safety: 'Safety',
  property: 'Property',
  environment: 'Environment',
} as const
