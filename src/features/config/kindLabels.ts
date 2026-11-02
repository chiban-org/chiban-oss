import type { ConfigKind } from '@/features/config/kinds'

export const KIND_LABELS: Record<ConfigKind, string> = {
  application_type: 'Application types',
  form: 'Forms',
  fee_schedule: 'Fee schedules',
  template: 'Templates',
  condition_library: 'Condition libraries',
  inspection_checklist: 'Inspection checklists',
  town_rule_setting: 'Town rule settings',
  local_code_amendment: 'Local code amendments',
  payment_settings: 'Payment settings',
  inspection_settings: 'Inspection settings',
  board_settings: 'Board settings',
  regional_contacts: 'Regional notice contacts',
  review_routes: 'Technical Review Committee routes',
}
