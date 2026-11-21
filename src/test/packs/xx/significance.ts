import type { AppealRoute, ProceedingClassification, StatePack } from '@/features/packs/schema'
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

function withSignificantSubdivision(ruleKeys: readonly string[]): ProceedingClassification[] {
  return XX_OPTIONAL_HEARING.manifest.classifications.map((c) =>
    c.key === XX_PB_SUBDIVISION_KEY
      ? {
          ...c,
          significanceApplies: true,
          mandatoryRuleKeys: [...c.mandatoryRuleKeys, ...ruleKeys],
        }
      : c,
  )
}

const CLASSIFICATIONS = withSignificantSubdivision(WINDOW_KEYS).map((c) =>
  c.key === 'xx.board_variance' ? { ...c, hearing: 'optional' as const, requiredSubsteps: [] } : c,
)

export const XX_SIGNIFICANT_ROUTES: StatePack = xxPackWith({
  manifest: { rules: RULES, classifications: CLASSIFICATIONS },
  pack: {
    ruleAreas: [{ title: 'All rules', rules: RULES }],
    appealRoutes: ROUTES,
    labels: { ...XX_PACK.labels, significantDecisionHelp: XX_SIGNIFICANT_HELP },
  },
})

export const XX_GENERIC_DENIAL = courtWindow(
  'xx.appeal.generic_denial',
  'Court appeal of a denial',
  30,
  {
    startEvent: 'board_vote',
    onlyWhen: [
      { fact: 'outcome', in: ['denied'] },
      { fact: 'significantDecision', is: false },
    ],
  },
)
export const XX_SIGNIFICANT_DENIAL = courtWindow(
  'xx.appeal.significant_denial',
  'Court appeal of a significant denial',
  30,
  {
    startEvent: 'board_vote',
    onlyWhen: [
      { fact: 'outcome', in: ['denied'] },
      { fact: 'significantDecision', is: true },
    ],
  },
)

const DENIAL_RULES = [...XX_PACK.manifest.rules, XX_GENERIC_DENIAL, XX_SIGNIFICANT_DENIAL]
const DENIAL_KEYS = [XX_GENERIC_DENIAL.key, XX_SIGNIFICANT_DENIAL.key]

export const XX_SIGNIFICANT_WINDOWS: StatePack = xxPackWith({
  manifest: {
    rules: DENIAL_RULES,
    classifications: withSignificantSubdivision(DENIAL_KEYS),
  },
  pack: { ruleAreas: [{ title: 'All rules', rules: DENIAL_RULES }] },
})
