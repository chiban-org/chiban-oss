import type { PackRule, StatePack } from '@/features/packs/schema'
import { XX_RANGE_PENALTY, XX_RANGE_PENALTY_KEY } from './enforcementRules'
import { XX_PACK } from './index'
import { xxPackWith } from './variants'

export const XX_CURE_CLOCK_KEY = 'xx.enf.cure_period'
export const XX_CURE_RULE_KEY = 'xx.enf.cure_notice'
export const XX_CURE_LABEL = 'Cure procedure'
const ENFORCEMENT_ACT = 'https://laws.example/vellmora/enforcement-act'

export const XX_CURE_CLOCK: PackRule = {
  kind: 'clock',
  key: XX_CURE_CLOCK_KEY,
  version: 1,
  label: 'Time to cure a violation',
  citation: { label: 'Vellmora Enforcement Act 6', url: ENFORCEMENT_ACT },
  clockType: 'action_due',
  whose: 'third_party',
  startEvent: 'cure_notice_sent',
  length: { unit: 'days', value: 10 },
  direction: 'after',
  consequence: { kind: 'enforcement_step_opens', text: 'The town may seek a remedy.' },
  extension: { allowed: false, note: 'The act provides no extension.' },
  waivable: false,
  overridePolicy: { policy: 'fixed' },
}

export function xxCureRule(
  remedies: { developmentHold: boolean; civilAction: boolean } = {
    developmentHold: true,
    civilAction: true,
  },
  penaltyRuleKey = 'xx.enf.penalty',
): PackRule {
  return {
    kind: 'cure_notice',
    key: XX_CURE_RULE_KEY,
    version: 1,
    label: XX_CURE_LABEL,
    citation: { label: 'Vellmora Enforcement Act 6', url: ENFORCEMENT_ACT },
    occupant: 'if_applicable',
    method: 'certified_mail_return_receipt',
    cureRuleKey: XX_CURE_CLOCK_KEY,
    penaltyRuleKey,
    remedies,
    overridePolicy: { policy: 'fixed' },
  }
}

const CURE_RULES: PackRule[] = [...XX_PACK.manifest.rules, XX_CURE_CLOCK, xxCureRule()]

export const XX_CURE: StatePack = xxPackWith({
  manifest: { rules: CURE_RULES },
  pack: { ruleAreas: [{ title: 'All rules', rules: CURE_RULES }] },
})

const RANGE_RULES: PackRule[] = [
  ...XX_PACK.manifest.rules,
  XX_CURE_CLOCK,
  xxCureRule(undefined, XX_RANGE_PENALTY_KEY),
  XX_RANGE_PENALTY,
]

export const XX_CURE_RANGE: StatePack = xxPackWith({
  manifest: { rules: RANGE_RULES },
  pack: { ruleAreas: [{ title: 'All rules', rules: RANGE_RULES }] },
})
