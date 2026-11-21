import type { AppealRoute, StatePack } from '@/features/packs/schema'
import { XX_PACK } from './index'
import { courtWindow } from './projectFinality'
import { XX_OPTIONAL_HEARING, XX_PB_SUBDIVISION_KEY, xxPackWith } from './variants'

const CITATION = {
  label: 'Vellmora Permit Act 23',
  url: 'https://laws.example/vellmora/permit-act',
}

export const XX_SIGNIFICANT_HELP = 'Vellmora Land Act 30 lists the large projects.'

export const XX_BOARD_COURT = courtWindow('xx.appeal.board_court', 'Court appeal', 30, {
  startEvent: 'board_vote',
})
export const XX_SIGNIFICANT_COURT = courtWindow(
  'xx.appeal.significant_court',
  'Court appeal of a significant decision',
  10,
  { startEvent: 'board_vote' },
)
export const XX_COURT_AFTER_RECONSIDERATION = courtWindow(
  'xx.appeal.court_after_reconsideration',
  'Court appeal after reconsideration',
  30,
  { startEvent: 'rehearing_vote' },
)
export const XX_SIGNIFICANT_AFTER_RECONSIDERATION = courtWindow(
  'xx.appeal.significant_after_reconsideration',
  'Court appeal of a significant decision after reconsideration',
  10,
  { startEvent: 'rehearing_vote' },
)

const WINDOW_RULES = [
  XX_BOARD_COURT,
  XX_SIGNIFICANT_COURT,
  XX_COURT_AFTER_RECONSIDERATION,
  XX_SIGNIFICANT_AFTER_RECONSIDERATION,
]
const WINDOW_KEYS = WINDOW_RULES.map((r) => r.key)
const RULES = [...XX_PACK.manifest.rules, ...WINDOW_RULES]

const SIGNIFICANT = { significant: true, label: 'significant land use decision' }

const ROUTES: AppealRoute[] = [
  {
    from: 'pb_decision',
    to: 'court_petition',
    windowRuleKey: XX_BOARD_COURT.key,
    citation: CITATION,
  },
  {
    from: 'pb_decision',
    when: SIGNIFICANT,
    to: 'court_petition',
    windowRuleKey: XX_SIGNIFICANT_COURT.key,
    citation: CITATION,
  },
  { from: 'pb_decision', to: 'rehearing_motion', windowRuleKey: null, citation: CITATION },
  { from: 'rehearing_motion', to: 'rehearing_outcome', windowRuleKey: null, citation: CITATION },
  {
    from: 'rehearing_outcome',
    to: 'court_petition',
    windowRuleKey: XX_COURT_AFTER_RECONSIDERATION.key,
    citation: CITATION,
  },
  {
    from: 'rehearing_outcome',
    when: SIGNIFICANT,
    to: 'court_petition',
    windowRuleKey: XX_SIGNIFICANT_AFTER_RECONSIDERATION.key,
    citation: CITATION,
  },
]

const CLASSIFICATIONS = XX_OPTIONAL_HEARING.manifest.classifications.map((c) => {
  if (c.key === 'xx.board_variance')
    return { ...c, hearing: 'optional' as const, requiredSubsteps: [] }
  if (c.key === XX_PB_SUBDIVISION_KEY)
    return {
      ...c,
      significanceApplies: true,
      mandatoryRuleKeys: [...c.mandatoryRuleKeys, ...WINDOW_KEYS],
    }
  return c
})

export const XX_SIGNIFICANT_ROUTES: StatePack = xxPackWith({
  manifest: { rules: RULES, classifications: CLASSIFICATIONS },
  pack: {
    ruleAreas: [{ title: 'All rules', rules: RULES }],
    appealRoutes: ROUTES,
    labels: { ...XX_PACK.labels, significantDecisionHelp: XX_SIGNIFICANT_HELP },
  },
})
