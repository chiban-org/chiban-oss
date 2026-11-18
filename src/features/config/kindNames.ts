export const CONFIG_KINDS = [
  'application_type',
  'form',
  'fee_schedule',
  'template',
  'condition_library',
  'inspection_checklist',
  'town_rule_setting',
  'local_code_amendment',
  'payment_settings',
  'inspection_settings',
  'board_settings',
  'regional_contacts',
  'review_routes',
  'town_profile',
  'notification_wording',
] as const
export type ConfigKind = (typeof CONFIG_KINDS)[number]

export const SINGLETON_KEY = 'default'

export const SINGLETON_KINDS: readonly ConfigKind[] = [
  'payment_settings',
  'inspection_settings',
  'board_settings',
  'regional_contacts',
  'review_routes',
  'town_profile',
  'notification_wording',
]

export function isSingletonKind(kind: ConfigKind): boolean {
  return SINGLETON_KINDS.includes(kind)
}

const PINNED_KINDS: readonly ConfigKind[] = [
  'application_type',
  'form',
  'fee_schedule',
  'template',
  'condition_library',
  'inspection_checklist',
]

export function isPinnedKind(kind: ConfigKind): boolean {
  return PINNED_KINDS.includes(kind)
}
