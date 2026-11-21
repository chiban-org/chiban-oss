import type { AppealRoute, ClockRule, StatePack } from '@/features/packs/schema'
import { XX_PACK } from './index'
import { XX_OPTIONAL_HEARING, XX_PB_SUBDIVISION_KEY, xxPackWith } from './variants'

const CITATION = {
  label: 'Vellmora Permit Act 22',
  url: 'https://laws.example/vellmora/permit-act',
}

export function courtWindow(
  key: string,
  label: string,
  days: number,
  start: Pick<ClockRule, 'startEvent' | 'onlyWhen'>,
): ClockRule {
  const { startEvent, onlyWhen } = start
  return {
    kind: 'clock',
    key,
    version: 1,
    label,
    citation: CITATION,
    clockType: 'filing_window',
    whose: 'third_party',
    startEvent,
    length: { unit: 'days', value: days },
    direction: 'after',
    consequence: { kind: 'appeal_untimely', text: 'The filing is late.' },
    extension: { allowed: false, note: 'The act provides no extension.' },
    waivable: false,
    ...(onlyWhen === undefined ? {} : { onlyWhen }),
    overridePolicy: { policy: 'fixed' },
  }
}

export const XX_FINAL_APPROVAL_WINDOW = courtWindow(
  'xx.appeal.after_final_approval',
  'Court appeal after final approval',
  30,
  { startEvent: 'project_final_approval' },
)
export const XX_DENIAL_WINDOW = courtWindow(
  'xx.appeal.after_denial',
  'Court appeal of a denial',
  30,
  { startEvent: 'board_vote', onlyWhen: { fact: 'outcome', in: ['denied'] } },
)
export const XX_PB_FINAL_WINDOW = courtWindow(
  'xx.appeal.after_planning_final',
  'Court appeal when the planning body gave the final approval',
  45,
  { startEvent: 'project_final_approval' },
)

const WINDOW_RULES = [XX_FINAL_APPROVAL_WINDOW, XX_DENIAL_WINDOW, XX_PB_FINAL_WINDOW]
const WINDOW_KEYS = WINDOW_RULES.map((r) => r.key)
const RULES = [...XX_PACK.manifest.rules, ...WINDOW_RULES]

const APPEAL_TO_BOARD: AppealRoute = {
  from: 'zba_appeal',
  to: 'zba_decision',
  windowRuleKey: null,
  citation: CITATION,
}

const GENERAL_ROUTES: AppealRoute[] = [
  APPEAL_TO_BOARD,
  {
    from: 'zba_decision',
    to: 'court_petition',
    windowRuleKey: XX_FINAL_APPROVAL_WINDOW.key,
    citation: CITATION,
  },
  {
    from: 'pb_decision',
    to: 'court_petition',
    windowRuleKey: XX_FINAL_APPROVAL_WINDOW.key,
    citation: CITATION,
  },
]

const PLANNING_FINAL_ROUTE: AppealRoute = {
  from: 'zba_decision',
  when: { finalReviewBoard: 'planning_board', label: 'planning body gave the final approval' },
  to: 'court_petition',
  windowRuleKey: XX_PB_FINAL_WINDOW.key,
  citation: CITATION,
}

const CLASSIFICATIONS = XX_OPTIONAL_HEARING.manifest.classifications.map((c) =>
  c.key === 'xx.board_variance' || c.key === XX_PB_SUBDIVISION_KEY
    ? {
        ...c,
        hearing: 'optional' as const,
        requiredSubsteps: [],
        mandatoryRuleKeys: [...c.mandatoryRuleKeys, ...WINDOW_KEYS],
      }
    : c,
)

function finalityPack(appealRoutes: AppealRoute[]): StatePack {
  return xxPackWith({
    manifest: { rules: RULES, classifications: CLASSIFICATIONS },
    pack: { ruleAreas: [{ title: 'All rules', rules: RULES }], appealRoutes },
  })
}

export const XX_PROJECT_FINALITY = finalityPack(GENERAL_ROUTES)
export const XX_PROJECT_FINALITY_BY_BOARD = finalityPack([...GENERAL_ROUTES, PLANNING_FINAL_ROUTE])

const BY_OUTCOME_ROUTES: AppealRoute[] = [
  APPEAL_TO_BOARD,
  {
    from: 'zba_decision',
    when: { outcome: 'granted', label: 'approved' },
    to: 'court_petition',
    windowRuleKey: XX_FINAL_APPROVAL_WINDOW.key,
    citation: CITATION,
  },
  {
    from: 'zba_decision',
    when: { outcome: 'denied', label: 'denied' },
    to: 'court_petition',
    windowRuleKey: XX_DENIAL_WINDOW.key,
    citation: CITATION,
  },
  {
    from: 'pb_decision',
    to: 'court_petition',
    windowRuleKey: XX_FINAL_APPROVAL_WINDOW.key,
    citation: CITATION,
  },
]

export const XX_PROJECT_FINALITY_BY_OUTCOME = finalityPack(BY_OUTCOME_ROUTES)
