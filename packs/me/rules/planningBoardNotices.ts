import { ME_URLS, TOWN_RULE } from '@packs/me/rules/urls'
import type { ClockRule, NoticeRequirementRule, PackRule } from '@/features/packs/schema'

const cite = (paragraph: string) => ({
  label: `30-A MRSA §4403${paragraph}`,
  url: ME_URLS.title30Asec4403,
})

function setting(key: string, label: string, value: number): PackRule {
  return {
    kind: 'town_setting',
    key,
    version: 1,
    label: `${label} (Chiban starting value)`,
    citation: TOWN_RULE,
    unit: 'days',
    overridePolicy: { policy: 'delegated_choice', default: value },
  }
}

function hearingLead(fields: {
  key: string
  label: string
  fromSetting: string
  paragraph: string
}): ClockRule {
  const { key, label, fromSetting, paragraph } = fields
  return {
    kind: 'clock',
    key,
    version: 1,
    label,
    citation: cite(paragraph),
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'acceptance_meeting_set',
    length: { unit: 'days', fromSetting },
    direction: 'before',
    consequence: {
      kind: 'notice_defective',
      text: `30-A MRSA §4403${paragraph} requires this notice and sets no day count. The town sets this date.`,
    },
    extension: { allowed: false, note: 'The town rule sets the notice period.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  }
}

function requirement(
  fields: Pick<
    NoticeRequirementRule,
    'key' | 'label' | 'channel' | 'recipients' | 'leadRuleKey' | 'citation' | 'stage'
  > &
    Partial<Pick<NoticeRequirementRule, 'onlyWhen'>>,
): NoticeRequirementRule {
  return { kind: 'notice_requirement', version: 1, overridePolicy: { policy: 'fixed' }, ...fields }
}

export const PLANNING_BOARD_NOTICE_RULES: PackRule[] = [
  setting('town.pb.receipt_notice_days', 'Days to mail the subdivision receipt notices', 7),
  {
    kind: 'clock',
    key: 'me.pb.receipt_notice',
    version: 1,
    label: 'Mail the subdivision receipt notices',
    citation: cite('(3)(A)'),
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'application_received',
    length: { unit: 'days', fromSetting: 'town.pb.receipt_notice_days' },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: '30-A MRSA §4403(3)(A) requires the notices when an application is received and sets no day count. The town sets this date.',
    },
    extension: { allowed: false, note: 'The town rule sets the period.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  requirement({
    key: 'me.pb.notice.receipt_mail',
    label: 'Subdivision receipt notice to abutters and neighboring municipalities',
    channel: 'first_class_mail',
    recipients: { roles: ['abutter_owner', 'municipal_clerk', 'municipal_reviewing_authority'] },
    leadRuleKey: 'me.pb.receipt_notice',
    stage: 'on_receipt',
    citation: cite('(3)(A)'),
  }),
  requirement({
    key: 'me.pb.notice.receipt_water',
    label: 'Subdivision receipt notice to the public water supplier',
    channel: 'first_class_mail',
    recipients: { roles: ['water_supplier'] },
    leadRuleKey: 'me.pb.receipt_notice',
    stage: 'on_receipt',
    onlyWhen: 'source_water_area',
    citation: cite('(3)(A)'),
  }),
  {
    kind: 'clock',
    key: 'me.pb.hearing_notice_first',
    version: 1,
    label: 'First newspaper publication of the subdivision hearing',
    citation: cite('(4)(B)'),
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'acceptance_meeting_set',
    length: { unit: 'days', value: 7 },
    direction: 'before',
    consequence: {
      kind: 'notice_defective',
      text: 'A first publication later than this does not meet 30-A MRSA §4403(4)(B).',
    },
    extension: { allowed: false, note: '30-A MRSA §4403(4)(B) sets the minimum notice period.' },
    waivable: false,
    overridePolicy: { policy: 'minimum', floor: 7 },
  },
  setting(
    'town.pb.second_publication_days',
    'Days before the hearing for the second publication',
    1,
  ),
  hearingLead({
    key: 'me.pb.hearing_notice_second',
    label: 'Second newspaper publication of the subdivision hearing',
    fromSetting: 'town.pb.second_publication_days',
    paragraph: '(4)(B)',
  }),
  setting('town.pb.applicant_notice_days', 'Days before the hearing to notify the applicant', 7),
  hearingLead({
    key: 'me.pb.applicant_notice_lead',
    label: 'Hearing notice to the subdivision applicant',
    fromSetting: 'town.pb.applicant_notice_days',
    paragraph: '(4)(A)',
  }),
  requirement({
    key: 'me.pb.notice.hearing_first',
    label: 'Subdivision hearing notice, first publication',
    channel: 'newspaper',
    recipients: { public: true },
    leadRuleKey: 'me.pb.hearing_notice_first',
    stage: 'before_hearing',
    citation: cite('(4)(B)'),
  }),
  requirement({
    key: 'me.pb.notice.hearing_second',
    label: 'Subdivision hearing notice, second publication',
    channel: 'newspaper',
    recipients: { public: true },
    leadRuleKey: 'me.pb.hearing_notice_second',
    stage: 'before_hearing',
    citation: cite('(4)(B)'),
  }),
  requirement({
    key: 'me.pb.notice.applicant',
    label: 'Subdivision hearing notice to the applicant',
    channel: 'first_class_mail',
    recipients: { roles: ['applicant'] },
    leadRuleKey: 'me.pb.applicant_notice_lead',
    stage: 'before_hearing',
    citation: cite('(4)(A)'),
  }),
]

export const SUBDIVISION_NOTICE_REQUIREMENTS = [
  'me.pb.notice.receipt_mail',
  'me.pb.notice.receipt_water',
  'me.pb.notice.hearing_second',
  'me.pb.notice.hearing_first',
  'me.pb.notice.applicant',
]
