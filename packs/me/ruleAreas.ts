import { BUILDING_RULES } from '@packs/me/rules/building'
import { LOCAL_PERMIT_RULES } from '@packs/me/rules/localPermits'
import { PLUMBING_RULES } from '@packs/me/rules/plumbing'
import { FOAA_RULES } from '@packs/me/rules/rightToKnow'
import type { RuleArea } from '@/features/packs/schema'

export const ME_RULE_AREAS: readonly RuleArea[] = [
  { title: 'Building permits', rules: BUILDING_RULES },
  { title: 'Local permits', rules: LOCAL_PERMIT_RULES },
  { title: 'Plumbing and subsurface wastewater', rules: PLUMBING_RULES },
  { title: 'FOAA requests', rules: FOAA_RULES },
]
