import type { COUNSEL_OUTCOME_KINDS } from '@/db/schema'

export type CounselOutcomeKind = (typeof COUNSEL_OUTCOME_KINDS)[number]

export const COURT_OUTCOMES: readonly CounselOutcomeKind[] = [
  'motion_filed',
  'hearing_held',
  'judgment_for_town',
  'judgment_for_respondent',
  'appealed_to_superior_court',
]
