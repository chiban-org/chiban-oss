import type { PackRule } from '@packs/nh/schema'

export const TOWN_RULE_BOUNDS = {
  months: { min: 1, max: 120 },
  days: { min: 1, max: 365 },
  unitless: { min: 1, max: 365 },
} as const

type BoundsUnit = keyof typeof TOWN_RULE_BOUNDS

function unitOf(rule: PackRule): BoundsUnit {
  const unit =
    rule.kind === 'town_setting' ? rule.unit : rule.kind === 'clock' ? rule.length.unit : ''
  return unit === 'months' || unit === 'days' ? unit : 'unitless'
}

const UNSETTABLE: readonly string[] = ['fixed', 'locally_prohibited']

export function townRuleValueIssue(rule: PackRule, value: number): string | null {
  if (UNSETTABLE.includes(rule.overridePolicy.policy)) return null
  const unit = unitOf(rule)
  const { min, max } = TOWN_RULE_BOUNDS[unit]
  if (Number.isInteger(value) && value >= min && value <= max) return null
  const counted = unit === 'unitless' ? 'a whole number' : `a whole number of ${unit}`
  return `Enter ${counted} from ${min} to ${max}.`
}
