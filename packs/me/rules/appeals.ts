import { ME_URLS, TOWN_RULE } from '@packs/me/rules/urls'
import type { ClockRule, FactCondition, PackRule } from '@/features/packs/schema'

type WindowOptions = Pick<ClockRule, 'key' | 'label' | 'startEvent' | 'citation'> &
  Partial<Pick<ClockRule, 'onlyWhen' | 'cancelledBy'>> & {
    days: number
    extension: string
    filing?: string
  }

function courtWindow(options: WindowOptions): ClockRule {
  const { key, label, startEvent, citation, onlyWhen, cancelledBy, days, extension } = options
  const filing = options.filing ?? 'An appeal'
  return {
    kind: 'clock',
    key,
    version: 1,
    label,
    citation,
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent,
    length: { unit: 'days', value: days },
    direction: 'after',
    ...(onlyWhen === undefined ? {} : { onlyWhen }),
    ...(cancelledBy === undefined ? {} : { cancelledBy }),
    consequence: {
      kind: 'appeal_untimely',
      text: `${filing} filed after this date is untimely (${citation.label}).`,
    },
    extension: { allowed: false, note: extension },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  }
}

const SECTION_2691 = (paragraph: string) => ({
  label: `30-A MRSA §2691(3)${paragraph}`,
  url: ME_URLS.title30Asec2691,
})
const OTHER_DECISIONS = { label: '30-A MRSA §4482-A, §4482-B', url: ME_URLS.title30Asec4482A }
const COURT_EXTENDS_2691 =
  'Only the Superior Court may extend this period, on motion for good cause shown (30-A MRSA §2691(3)(G)).'
const COURT_EXTENDS_4482_A =
  'Only the Superior Court may extend this period, on motion for good cause shown (30-A MRSA §4482-A(1)).'
const COURT_ENLARGES_80B =
  'Only the court may enlarge this period, under M.R. Civ. P. 6(b) as Rule 80B(b) allows.'

const PLANNING_BOARD_LAST: FactCondition = { fact: 'finalReviewBoard', in: ['planning_board'] }
const NOT_SIGNIFICANT: FactCondition = { fact: 'significantDecision', is: false }
const SIGNIFICANT: FactCondition = { fact: 'significantDecision', is: true }
const DENIED: FactCondition = { fact: 'outcome', in: ['denied'] }

export const APPEAL_RULES: PackRule[] = [
  {
    kind: 'town_setting',
    key: 'town.appeal.admin_to_boa_days',
    version: 1,
    label:
      'Days to appeal an administrative decision to the Board of Appeals (Chiban starting value)',
    citation: TOWN_RULE,
    unit: 'days',
    overridePolicy: { policy: 'delegated_choice', default: 30 },
  },
  {
    kind: 'clock',
    key: 'me.appeal.admin_to_boa',
    version: 1,
    label: 'Appeal of an administrative decision to the Board of Appeals',
    citation: { label: '30-A MRSA §4353(1)', url: ME_URLS.title30Asec4353 },
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent: 'administrative_decision',
    length: { unit: 'days', fromSetting: 'town.appeal.admin_to_boa_days' },
    direction: 'after',
    consequence: {
      kind: 'appeal_untimely',
      text: '30-A MRSA §4353 and §2691 set no period for an appeal to the board. The town ordinance sets it, and an appeal filed after this date is untimely under the town rule.',
    },
    extension: { allowed: false, note: 'The town rule sets the appeal period.' },
    waivable: false,
    overridePolicy: { policy: 'fixed' },
  },
  courtWindow({
    key: 'me.appeal.boa_reconsideration',
    label: 'Request to the Board of Appeals to reconsider its decision',
    startEvent: 'board_vote',
    citation: SECTION_2691('(F)'),
    days: 10,
    filing: 'A reconsideration request',
    extension: '30-A MRSA §2691(3)(F) provides no extension.',
  }),
  courtWindow({
    key: 'me.appeal.boa_court',
    label: 'Court appeal of a Board of Appeals decision',
    startEvent: 'board_vote',
    citation: SECTION_2691('(G), (H)'),
    days: 45,
    extension: COURT_EXTENDS_2691,
  }),
  courtWindow({
    key: 'me.appeal.boa_court_after_reconsideration',
    label: 'Court appeal of a reconsidered Board of Appeals decision',
    startEvent: 'rehearing_vote',
    citation: SECTION_2691('(F), (H)'),
    days: 15,
    extension: '30-A MRSA §2691(3)(F) and (H) provide no extension.',
  }),
  courtWindow({
    key: 'me.appeal.boa_court_after_planning_board',
    label: 'Court appeal of a Board of Appeals approval after the planning board approves last',
    startEvent: 'project_final_approval',
    onlyWhen: PLANNING_BOARD_LAST,
    cancelledBy: 'rehearing_vote',
    citation: { label: '30-A MRSA §2691(3); §4482-A(1)', url: ME_URLS.title30Asec2691 },
    days: 30,
    extension: COURT_EXTENDS_4482_A,
  }),
  courtWindow({
    key: 'me.appeal.board_court_final',
    label: 'Court appeal of an approval',
    startEvent: 'project_final_approval',
    onlyWhen: NOT_SIGNIFICANT,
    citation: OTHER_DECISIONS,
    days: 30,
    extension: COURT_EXTENDS_4482_A,
  }),
  courtWindow({
    key: 'me.appeal.board_court_denial',
    label: 'Court appeal of a denial',
    startEvent: 'board_vote',
    onlyWhen: [DENIED, NOT_SIGNIFICANT],
    citation: OTHER_DECISIONS,
    days: 30,
    extension: COURT_EXTENDS_4482_A,
  }),
  courtWindow({
    key: 'me.appeal.significant_final',
    label: 'Court appeal of a significant approval',
    startEvent: 'project_final_approval',
    onlyWhen: SIGNIFICANT,
    citation: {
      label: '30-A MRSA §4482(3); M.R. Civ. P. 80B(b)',
      url: ME_URLS.civilProcedureRules,
    },
    days: 30,
    extension: COURT_ENLARGES_80B,
  }),
  courtWindow({
    key: 'me.appeal.significant_denial',
    label: 'Court appeal of a significant denial',
    startEvent: 'decision_filed',
    onlyWhen: [DENIED, SIGNIFICANT],
    citation: { label: 'M.R. Civ. P. 80B(b)', url: ME_URLS.civilProcedureRules },
    days: 30,
    extension: COURT_ENLARGES_80B,
  }),
]

export const BOA_APPEAL_KEYS = [
  'me.appeal.boa_reconsideration',
  'me.appeal.boa_court',
  'me.appeal.boa_court_after_reconsideration',
  'me.appeal.boa_court_after_planning_board',
]

export const PB_APPEAL_KEYS = [
  'me.appeal.board_court_final',
  'me.appeal.board_court_denial',
  'me.appeal.significant_final',
  'me.appeal.significant_denial',
]
