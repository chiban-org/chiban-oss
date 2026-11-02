const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g
const WORD = /[A-Za-z0-9_]+/g

export function findIsoDates(text: string): string[] {
  return text.match(ISO_DATE) ?? []
}

export function findRawKeys(text: string, keys: readonly string[]): string[] {
  const tokens = new Set(text.match(WORD) ?? [])
  return keys.filter((key) => tokens.has(key))
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g
const TAGS = /<[^>]*>/g
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
}

export function findUuids(text: string): string[] {
  return text.match(UUID) ?? []
}

export function visibleText(html: string): string {
  return html.replace(TAGS, ' ').replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (e) => ENTITIES[e] ?? e)
}

export const ENFORCEMENT_ENUM_KEYS = [
  'anonymous_web',
  'public_named',
  'staff_entry',
  'violation_found',
  'no_violation',
  'order_issued',
  'in_court',
  'zoning_ordinance',
  'building_code',
  'permit_condition',
  'approved_plan',
  'board_decision',
  'other_local_ordinance',
  'first_class_mail',
  'certified_mail',
  'filed_with_court',
  'motion_filed',
  'filed_with_clerk',
  'motion_to_enforce',
  'record_owner',
  'owner_agent',
  'occupying_tenant',
  'person_in_control',
  'mortgagee_of_record',
  'recipients_listed',
  'none_exist',
  'same_as_owner',
  'owner_not_found',
  'in_hand',
  'posting_on_property',
  'newspaper_publication',
  'deputy_sheriff',
  'local_police_officer',
  'civil_penalty',
  'costs_and_fees',
  'penalty_action',
  'judgment_for_town',
  'enforcement_photo',
  'enforcement_letter',
  'service_proof',
  'court_document',
  'order_served',
  'judgment_entered',
  'enforcement_step_opens',
] as const

export const RECORDS_ENUM_KEYS = [
  'awaiting_decision',
  'withheld_in_full',
  'time_statement',
  'made_available',
  'website_reference',
  'electronic_link',
  'release_redacted',
  'public_redacted',
  'rtk_release',
  'rtk_request',
  'rtk_letter',
  'appeal_period_expired',
  'building_removed',
  'septic_replaced_or_removed',
  'skipped_hold',
  'skipped_not_eligible',
  'awaiting_event',
  'single_family',
  'two_unit',
  'three_four_unit',
  'five_plus_unit',
  'foundation_or_finish_only',
  'whole_building',
  'addition_or_alteration',
  'unit_of_reported_multifamily',
  'application_snapshot',
  'other_law',
  'in_person',
] as const
