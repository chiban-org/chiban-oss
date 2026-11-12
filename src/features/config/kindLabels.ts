import type { ConfigKind } from '@/features/config/kinds'

export const KIND_LABELS: Record<ConfigKind, string> = {
  application_type: 'Application types',
  form: 'Forms',
  fee_schedule: 'Fee schedules',
  template: 'Templates',
  condition_library: 'Conditions',
  inspection_checklist: 'Inspection checklists',
  town_rule_setting: 'Town rule settings',
  local_code_amendment: 'Local code amendments',
  payment_settings: 'Payment settings',
  inspection_settings: 'Inspection settings',
  board_settings: 'Board settings',
  regional_contacts: 'Regional notice contacts',
  review_routes: 'Technical Review Committee routes',
  town_profile: 'Town profile',
  notification_wording: 'Notification wording',
}

export const KIND_DESCRIPTIONS: Record<ConfigKind, string> = {
  application_type:
    'The kinds of application the town accepts, each with its form, fees and workflow steps.',
  form: 'The questions an applicant answers for each kind of application.',
  fee_schedule: 'What each application costs and how the amount is worked out.',
  template: 'The wording of the permits, decisions, notices and letters Chiban writes.',
  condition_library: 'Standard conditions staff can attach to an approval.',
  inspection_checklist: 'The items an inspector checks at each kind of inspection.',
  town_rule_setting:
    'Values state law leaves to the town, such as how long a building permit stays valid.',
  local_code_amendment: 'Changes the town has adopted to the state building code.',
  payment_settings: 'The convenience fee, who checks are payable to, and the receipt footer.',
  inspection_settings: 'Inspection days and hours, slot length, notice and booking limits.',
  board_settings: 'Each board, how it posts public notice, and how abutter lists are drawn.',
  regional_contacts: 'Who is sent notice when an application may have impact beyond the town.',
  review_routes:
    'Which departments the Technical Review Committee asks to review each kind of application.',
  town_profile:
    'The office name, address, contact details, logo, letterhead and signers on every document Chiban prints.',
  notification_wording:
    'The subject and wording of each email Chiban sends to applicants, contractors, staff, reviewers, boards and records requesters.',
}

const START_SETTINGS = 'Start the settings'

export const KIND_NEW_LABELS: Record<ConfigKind, string> = {
  application_type: 'New type',
  form: 'New form',
  fee_schedule: 'New fee schedule',
  template: 'New template',
  condition_library: 'New set of conditions',
  inspection_checklist: 'New checklist',
  town_rule_setting: 'Set a town rule',
  local_code_amendment: 'New amendment',
  payment_settings: START_SETTINGS,
  inspection_settings: START_SETTINGS,
  board_settings: START_SETTINGS,
  regional_contacts: START_SETTINGS,
  review_routes: START_SETTINGS,
  town_profile: START_SETTINGS,
  notification_wording: START_SETTINGS,
}

const EMPTY_COPY: Partial<Record<ConfigKind, { title: string; description: string }>> = {
  town_rule_setting: {
    title: 'No town rules are set',
    description:
      "Until the town sets one, Chiban uses the value state law gives for each rule. Set a rule to record the town's own value and who adopted it.",
  },
  local_code_amendment: {
    title: 'No local amendments are on file',
    description:
      'The state building code applies as written. Add an amendment when the town adopts a change, with who adopted it and when.',
  },
}

export function emptyKindCopy(kind: ConfigKind): { title: string; description: string } {
  return (
    EMPTY_COPY[kind] ?? {
      title: `No ${KIND_LABELS[kind].toLowerCase()} yet`,
      description: 'Nothing is set up here yet.',
    }
  )
}
