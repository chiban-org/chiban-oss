import { APPEAL_RULES } from '@packs/me/rules/appeals'
import { BOARD_OF_APPEALS_RULES } from '@packs/me/rules/boardOfAppeals'
import { BUILDING_RULES } from '@packs/me/rules/building'
import { ENFORCEMENT_RULES } from '@packs/me/rules/enforcement'
import { LOCAL_PERMIT_RULES } from '@packs/me/rules/localPermits'
import { PLANNING_BOARD_RULES } from '@packs/me/rules/planningBoard'
import { PLUMBING_RULES } from '@packs/me/rules/plumbing'
import { FOAA_RULES } from '@packs/me/rules/rightToKnow'
import type { RuleArea } from '@/features/packs/schema'

export const ME_RULE_AREAS: readonly RuleArea[] = [
  { title: 'Building permits', rules: BUILDING_RULES },
  { title: 'Local permits', rules: LOCAL_PERMIT_RULES },
  { title: 'Plumbing and subsurface wastewater', rules: PLUMBING_RULES },
  { title: 'Planning Board and subdivision', rules: PLANNING_BOARD_RULES },
  { title: 'Board of Appeals', rules: BOARD_OF_APPEALS_RULES },
  { title: 'Appeals', rules: APPEAL_RULES },
  { title: 'Enforcement', rules: ENFORCEMENT_RULES },
  { title: 'FOAA requests', rules: FOAA_RULES },
]
