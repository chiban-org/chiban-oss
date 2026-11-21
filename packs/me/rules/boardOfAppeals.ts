import { ME_URLS, TOWN_RULE } from '@packs/me/rules/urls'
import type { NoticeRequirementRule, PackRule } from '@/features/packs/schema'

const SECTION_2691_3_E = { label: '30-A MRSA §2691(3)(E)', url: ME_URLS.title30Asec2691 } as const
const SECTION_4353_3 = { label: '30-A MRSA §4353(3)', url: ME_URLS.title30Asec4353 } as const
const SECTION_4353_5 = { label: '30-A MRSA §4353(5)', url: ME_URLS.title30Asec4353 } as const

function hearingNotice(
  fields: Pick<NoticeRequirementRule, 'key' | 'label' | 'recipients' | 'citation'>,
): NoticeRequirementRule {
  return {
    kind: 'notice_requirement',
    version: 1,
    channel: 'first_class_mail',
    leadRuleKey: 'me.boa.hearing_notice',
    stage: 'before_hearing',
    overridePolicy: { policy: 'fixed' },
    ...fields,
  }
}

const HEARING_NOTICE_RULES: PackRule[] = [
  {
    kind: 'town_setting',
    key: 'town.boa.notice_days',
    version: 1,
    label: 'Days before a Board of Appeals hearing to mail notice (Chiban starting value)',
    citation: TOWN_RULE,
    unit: 'days',
    overridePolicy: { policy: 'delegated_choice', default: 7 },
  },
  {
    kind: 'clock',
    key: 'me.boa.hearing_notice',
    version: 1,
    label: 'Board of Appeals hearing notice',
    citation: SECTION_4353_3,
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'acceptance_meeting_set',
    length: { unit: 'days', fromSetting: 'town.boa.notice_days' },
    direction: 'before',
    consequence: {
      kind: 'none_stated',
      text: '30-A MRSA §4353(3) requires the board to reasonably notify the petitioner, the planning board and the municipal officers of any hearing and sets no day count for it. The town sets this date.',
    },
    extension: { allowed: false, note: 'The town rule sets the notice period.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  hearingNotice({
    key: 'me.boa.notice.parties',
    label: 'Board of Appeals hearing notice to the parties',
    recipients: { roles: ['applicant', 'planning_board', 'municipal_officers'] },
    citation: SECTION_4353_3,
  }),
  hearingNotice({
    key: 'town.boa.notice.abutters',
    label: 'Board of Appeals hearing notice to abutters',
    recipients: { roles: ['abutter_owner'] },
    citation: TOWN_RULE,
  }),
]

const DECISION_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'me.boa.delivery_due',
    version: 1,
    label: 'Mail or hand deliver notice of the Board of Appeals decision',
    citation: SECTION_2691_3_E,
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'board_vote',
    length: { unit: 'days', value: 7 },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: '30-A MRSA §2691(3)(E) requires notice of the decision within 7 days and states no consequence for late notice. The decision shows as overdue for delivery.',
    },
    extension: { allowed: false, note: '30-A MRSA §2691(3)(E) provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'decision_delivery',
    key: 'me.boa.delivery',
    version: 1,
    label: 'Notice of the Board of Appeals decision',
    citation: SECTION_2691_3_E,
    boardKinds: ['zba'],
    recipients: ['applicant', 'agent', 'planning_board', 'municipal_officers'],
    methods: ['mail', 'hand'],
    dueRuleKey: 'me.boa.delivery_due',
    overridePolicy: { policy: 'fixed' },
  },
]

const VARIANCE_RECORDING_RULES: PackRule[] = [
  {
    kind: 'clock',
    key: 'me.boa.final_written_approval',
    version: 1,
    label: 'Record the variance certificate in the registry of deeds',
    citation: SECTION_4353_5,
    clockType: 'action_due',
    whose: 'applicant',
    startEvent: 'final_written_approval',
    length: { unit: 'days', value: 90 },
    direction: 'after',
    consequence: {
      kind: 'void_unless_recorded',
      text: 'Under 30-A MRSA §4353(5) the variance is void unless its certificate is recorded in the local registry of deeds within 90 days of the date of the final written approval, and it is not valid until recorded.',
    },
    extension: { allowed: false, note: '30-A MRSA §4353(5) provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'gate',
    key: 'me.boa.variance_recorded',
    version: 1,
    label: 'Variance relied on is recorded',
    citation: SECTION_4353_5,
    gateKind: 'statutory',
    appliesTo: ['issued', 'decided'],
    overridePolicy: { policy: 'fixed' },
  },
]

export const BOARD_OF_APPEALS_RULES: PackRule[] = [
  ...HEARING_NOTICE_RULES,
  ...DECISION_RULES,
  ...VARIANCE_RECORDING_RULES,
]

export const BOA_NOTICE_REQUIREMENTS = ['me.boa.notice.parties', 'town.boa.notice.abutters']

export const BOA_RULE_KEYS = [
  'town.boa.notice_days',
  'me.boa.hearing_notice',
  'me.boa.delivery_due',
]

export const BOA_VARIANCE_RECORDING_KEY = 'me.boa.final_written_approval'
