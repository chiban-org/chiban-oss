import { APPEAL_RULES } from '@packs/nh/rules/appeals'
import { BUILDING_RULES } from '@packs/nh/rules/building'
import { CODE_RULES } from '@packs/nh/rules/code'
import { DECISION_RULES } from '@packs/nh/rules/decisions'
import { ENFORCEMENT_RULES } from '@packs/nh/rules/enforcement'
import { LOCAL_PERMIT_RULES } from '@packs/nh/rules/localPermits'
import { NOTICE_REQUIREMENT_RULES } from '@packs/nh/rules/noticeRequirements'
import { PLANNING_BOARD_RULES } from '@packs/nh/rules/planningBoard'
import { REGIONAL_IMPACT_BOARD_RULES } from '@packs/nh/rules/regionalImpact'
import { RTK_RULES } from '@packs/nh/rules/rightToKnow'
import { ZBA_RULES } from '@packs/nh/rules/zba'
import type { RuleArea } from '@/features/packs/schema'

export const NH_RULE_AREAS: readonly RuleArea[] = [
  { title: 'Building permits', rules: BUILDING_RULES },
  { title: 'Building code', rules: CODE_RULES },
  { title: 'Planning Board', rules: PLANNING_BOARD_RULES },
  { title: 'Zoning Board of Adjustment', rules: ZBA_RULES },
  { title: 'Regional impact', rules: REGIONAL_IMPACT_BOARD_RULES },
  { title: 'Board decisions', rules: DECISION_RULES },
  { title: 'Notices', rules: NOTICE_REQUIREMENT_RULES },
  { title: 'Appeals', rules: APPEAL_RULES },
  { title: 'Local permits and registrations', rules: LOCAL_PERMIT_RULES },
  { title: 'Enforcement', rules: ENFORCEMENT_RULES },
  { title: 'Right-to-Know requests', rules: RTK_RULES },
]
