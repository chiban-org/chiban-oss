import { BUILDING_RULES } from '@packs/me/rules/building'
import { FOAA_RULES } from '@packs/me/rules/rightToKnow'
import type { RuleArea } from '@/features/packs/schema'

export const ME_RULE_AREAS: readonly RuleArea[] = [
  { title: 'Building permits', rules: BUILDING_RULES },
  { title: 'FOAA requests', rules: FOAA_RULES },
]
