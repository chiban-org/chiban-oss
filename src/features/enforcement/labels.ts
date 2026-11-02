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
