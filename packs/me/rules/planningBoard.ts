import { PLANNING_BOARD_NOTICE_RULES } from '@packs/me/rules/planningBoardNotices'
import { ME_URLS, TOWN_RULE } from '@packs/me/rules/urls'
import type { ClockRule, PackRule } from '@/features/packs/schema'

const SECTION_4403_5 = { label: '30-A MRSA §4403(5)', url: ME_URLS.title30Asec4403 } as const
const AGREED_LIMIT = 'or within any other time limit that is otherwise mutually agreed to'

function decision(
  fields: Pick<ClockRule, 'key' | 'label' | 'startEvent'> & { days: number },
  extra: Partial<ClockRule> = {},
): ClockRule {
  const { key, label, startEvent, days } = fields
  return {
    kind: 'clock',
    key,
    version: 1,
    label,
    citation: SECTION_4403_5,
    clockType: 'action_due',
    whose: 'board',
    startEvent,
    length: { unit: 'days', value: days },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: `30-A MRSA §4403(5) requires the order by this date, ${AGREED_LIMIT}, and states no consequence for a late order. The application shows as overdue.`,
    },
    extension: { allowed: true, by: 'applicant_consent' },
    waivable: false,
    satisfiedByDecision: true,
    overridePolicy: { policy: 'fixed' },
    ...extra,
  }
}

const SUBDIVISION_CLOCKS: PackRule[] = [
  {
    kind: 'clock',
    key: 'me.pb.completeness',
    version: 1,
    label: 'Subdivision completeness notice to the applicant',
    citation: { label: '30-A MRSA §4403(3)(B)', url: ME_URLS.title30Asec4403 },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'application_received',
    length: { unit: 'days', value: 30 },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: '30-A MRSA §4403(3)(B) states no consequence for a late completeness notice. The application shows as overdue.',
    },
    extension: { allowed: false, note: '30-A MRSA §4403(3)(B) provides no extension.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'clock',
    key: 'me.pb.hearing_window',
    version: 1,
    label: 'Hold the subdivision hearing',
    citation: { label: '30-A MRSA §4403(4)', url: ME_URLS.title30Asec4403 },
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'application_accepted',
    length: { unit: 'days', value: 30 },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: 'When the board decides to hold a hearing, 30-A MRSA §4403(4) requires it within 30 days of a complete application and states no consequence for a late hearing.',
    },
    extension: { allowed: false, note: '30-A MRSA §4403(4) provides no extension.' },
    waivable: false,
    onlyIfHearingScheduled: true,
    overridePolicy: { policy: 'fixed' },
  },
  decision(
    {
      key: 'me.pb.decision_no_hearing',
      label: 'Subdivision decision when no hearing is held',
      startEvent: 'application_accepted',
      days: 60,
    },
    { cancelledBy: 'hearing_held' },
  ),
  decision({
    key: 'me.pb.decision_after_hearing',
    label: 'Subdivision decision after the hearing',
    startEvent: 'hearing_held',
    days: 30,
  }),
]

const SITE_PLAN_RULES: PackRule[] = [
  {
    kind: 'town_setting',
    key: 'town.sp.decision_days',
    version: 1,
    label: 'Site plan decision period in days (Chiban starting value)',
    citation: TOWN_RULE,
    unit: 'days',
    overridePolicy: { policy: 'delegated_choice', default: 60 },
  },
  {
    kind: 'clock',
    key: 'town.sp.decision',
    version: 1,
    label: 'Site plan decision date',
    citation: TOWN_RULE,
    clockType: 'action_due',
    whose: 'board',
    startEvent: 'application_accepted',
    length: { unit: 'days', fromSetting: 'town.sp.decision_days' },
    direction: 'after',
    consequence: {
      kind: 'none_stated',
      text: 'The town site plan ordinance sets this date. A late decision shows as overdue.',
    },
    extension: { allowed: true, by: 'applicant_consent' },
    waivable: false,
    satisfiedByDecision: true,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'town_setting',
    key: 'town.sp.hearing_notice_days',
    version: 1,
    label: 'Days before a site plan hearing to give public notice (Chiban starting value)',
    citation: TOWN_RULE,
    unit: 'days',
    overridePolicy: { policy: 'delegated_choice', default: 7 },
  },
  {
    kind: 'clock',
    key: 'town.sp.hearing_notice',
    version: 1,
    label: 'Site plan hearing public notice',
    citation: TOWN_RULE,
    clockType: 'notice_lead',
    whose: 'board',
    startEvent: 'acceptance_meeting_set',
    length: { unit: 'days', fromSetting: 'town.sp.hearing_notice_days' },
    direction: 'before',
    consequence: {
      kind: 'none_stated',
      text: 'The town site plan ordinance sets the notice for a site plan hearing.',
    },
    extension: { allowed: false, note: 'The town rule sets the notice period.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  {
    kind: 'notice_requirement',
    key: 'town.sp.notice.hearing',
    version: 1,
    label: 'Site plan hearing public notice: how it is given',
    citation: TOWN_RULE,
    channel: { townChoice: ['public_posting', 'newspaper'] },
    recipients: { public: true },
    leadRuleKey: 'town.sp.hearing_notice',
    stage: 'before_hearing',
    overridePolicy: { policy: 'delegated_choice', default: 0 },
  },
  {
    kind: 'notice_requirement',
    key: 'town.sp.notice.abutters',
    version: 1,
    label: 'Site plan hearing notice to abutters',
    citation: TOWN_RULE,
    channel: 'first_class_mail',
    recipients: { roles: ['abutter_owner'] },
    leadRuleKey: 'town.sp.hearing_notice',
    stage: 'before_hearing',
    overridePolicy: { policy: 'fixed' },
  },
]

export const PLANNING_BOARD_RULES: PackRule[] = [
  ...SUBDIVISION_CLOCKS,
  ...PLANNING_BOARD_NOTICE_RULES,
  ...SITE_PLAN_RULES,
]

export const SUBDIVISION_RULE_KEYS = [...SUBDIVISION_CLOCKS, ...PLANNING_BOARD_NOTICE_RULES]
  .filter((r) => r.kind !== 'notice_requirement')
  .map((r) => r.key)

export const SITE_PLAN_RULE_KEYS = SITE_PLAN_RULES.filter(
  (r) => r.kind !== 'notice_requirement',
).map((r) => r.key)

export const SITE_PLAN_NOTICE_REQUIREMENTS = ['town.sp.notice.hearing', 'town.sp.notice.abutters']
