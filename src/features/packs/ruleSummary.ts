import type { OverridePolicy, PackRule, ProceedingClassification } from '@packs/nh/schema'
import type { Pack } from '@/features/packs/loadPack'

export interface RuleSummary {
  key: string
  version: number
  label: string
  citation: { label: string; url: string | null }
  policy: string
  unit: string | null
}

export function policyText(policy: OverridePolicy): string {
  switch (policy.policy) {
    case 'fixed':
      return 'Fixed by statute. The town cannot change it.'
    case 'minimum':
      return `The town may set a value of ${policy.floor} or more.`
    case 'maximum':
      return `The town may set a value of ${policy.ceiling} or less.`
    case 'delegated_choice':
      return policy.range === undefined
        ? `The town chooses. Default ${policy.default}.`
        : `The town chooses between ${policy.range.min} and ${policy.range.max}. Default ${policy.default}.`
    case 'locally_prohibited':
      return 'The town may not change this.'
  }
}

export function ruleSummary(rule: PackRule): RuleSummary {
  return {
    key: rule.key,
    version: rule.version,
    label: rule.label,
    citation: rule.citation,
    policy: policyText(rule.overridePolicy),
    unit: rule.kind === 'town_setting' ? rule.unit : null,
  }
}

export function classificationSummary(
  classification: ProceedingClassification,
  pack: Pack,
): { key: string; label: string; mandatory: string[] } {
  const labelOf = (key: string) => pack.rules.find((r) => r.key === key)?.label ?? key
  return {
    key: classification.key,
    label: classification.label,
    mandatory: classification.mandatoryRuleKeys.map(labelOf),
  }
}
