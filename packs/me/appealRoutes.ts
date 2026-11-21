import { ME_URLS } from '@packs/me/rules/urls'
import type { AppealRoute } from '@/features/packs/schema'

const SECTION_2691 = (paragraph: string) => ({
  label: `30-A MRSA §2691(3)${paragraph}`,
  url: ME_URLS.title30Asec2691,
})
const SECTION_4353_1 = { label: '30-A MRSA §4353(1)', url: ME_URLS.title30Asec4353 }
const OTHER_DECISIONS = { label: '30-A MRSA §4482-A, §4482-B', url: ME_URLS.title30Asec4482A }
const SIGNIFICANT = { label: '30-A MRSA §4482(3)', url: ME_URLS.title30Asec4482 }
const PLANNING_FINAL = 'the planning board gave the last municipal approval'

export const ME_APPEAL_ROUTES: AppealRoute[] = [
  {
    from: 'administrative_decision',
    to: 'zba_appeal',
    windowRuleKey: 'me.appeal.admin_to_boa',
    citation: SECTION_4353_1,
  },
  {
    from: 'zba_appeal',
    to: 'zba_decision',
    windowRuleKey: null,
    citation: SECTION_4353_1,
  },
  {
    from: 'zba_decision',
    to: 'court_petition',
    windowRuleKey: 'me.appeal.boa_court',
    citation: SECTION_2691('(G), (H)'),
  },
  {
    from: 'zba_decision',
    when: { outcome: 'granted', finalReviewBoard: 'planning_board', label: PLANNING_FINAL },
    to: 'court_petition',
    windowRuleKey: 'me.appeal.board_court_final',
    citation: OTHER_DECISIONS,
  },
  {
    from: 'zba_decision',
    to: 'rehearing_motion',
    windowRuleKey: 'me.appeal.boa_reconsideration',
    citation: SECTION_2691('(F)'),
  },
  {
    from: 'rehearing_motion',
    to: 'rehearing_outcome',
    windowRuleKey: null,
    citation: SECTION_2691('(F)'),
  },
  {
    from: 'rehearing_outcome',
    to: 'court_petition',
    windowRuleKey: 'me.appeal.boa_court_after_reconsideration',
    citation: SECTION_2691('(F)'),
  },
  {
    from: 'rehearing_outcome',
    when: { finalReviewBoard: 'planning_board', label: PLANNING_FINAL },
    to: 'court_petition',
    windowRuleKey: 'me.appeal.board_court_final',
    citation: SECTION_2691('(F)'),
  },
  {
    from: 'pb_decision',
    when: { outcome: 'denied', label: 'denied' },
    to: 'court_petition',
    windowRuleKey: 'me.appeal.board_court_denial',
    citation: OTHER_DECISIONS,
  },
  {
    from: 'pb_decision',
    when: { outcome: 'granted', label: 'approved' },
    to: 'court_petition',
    windowRuleKey: 'me.appeal.board_court_final',
    citation: OTHER_DECISIONS,
  },
  {
    from: 'pb_decision',
    when: { outcome: 'denied', significant: true, label: 'a significant decision, denied' },
    to: 'court_petition',
    windowRuleKey: 'me.appeal.significant_denial',
    citation: SIGNIFICANT,
  },
  {
    from: 'pb_decision',
    when: { outcome: 'granted', significant: true, label: 'a significant decision, approved' },
    to: 'court_petition',
    windowRuleKey: 'me.appeal.significant_final',
    citation: SIGNIFICANT,
  },
]
