import { PLANNING_BOARD_NOTICE_RULES } from '@packs/me/rules/planningBoardNotices'
import { ME_URLS, TOWN_RULE } from '@packs/me/rules/urls'
import type { ClockRule, PackRule } from '@/features/packs/schema'

const SECTION_4403_5 = { label: '30-A MRSA §4403(5)', url: ME_URLS.title30Asec4403 } as const
const AGREED_LIMIT =
  'or within any other time limit mutually agreed to by the board and the applicant'

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
      text: 'The town site plan ordinance sets this date. Maine law states no consequence for a late site plan decision.',
    },
    extension: { allowed: true, by: 'applicant_consent' },
    waivable: false,
    satisfiedByDecision: true,
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

export const SITE_PLAN_RULE_KEYS = SITE_PLAN_RULES.map((r) => r.key)
