import type { PackRule, StatePack } from '@/features/packs/schema'
import { XX_RANGE_PENALTY } from './enforcementRules'
import { XX_PACK } from './index'
import { xxPackWith } from './variants'

export const XX_NO_ORDER_PENALTY_KEY = 'xx.enf.penalty_no_order'

export const XX_NO_ORDER_PENALTY: PackRule = {
  ...XX_RANGE_PENALTY,
  key: XX_NO_ORDER_PENALTY_KEY,
  label: 'Daily penalty with no order',
  accrual: null,
} as PackRule

const NO_ORDER_RULES: PackRule[] = [
  ...XX_PACK.manifest.rules.filter((r) => r.kind !== 'cease_and_desist'),
  XX_NO_ORDER_PENALTY,
]

export const XX_NO_ORDERS: StatePack = xxPackWith({
  roles: {
    rules: {
      zoningOrder: null,
      buildingCodeOrder: null,
      enforcementPenalty: XX_NO_ORDER_PENALTY_KEY,
    },
  },
  manifest: { rules: NO_ORDER_RULES },
  pack: {
    ruleAreas: [{ title: 'All rules', rules: NO_ORDER_RULES }],
    buildingCodes: {
      choices: [{ key: 'xx.code.a', label: 'Vellmora Code A' }],
      defaultChoice: 'xx.code.a',
      requiredAbove: null,
    },
  },
})
