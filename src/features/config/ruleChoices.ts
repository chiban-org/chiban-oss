import { inRuleGroup } from '@/features/packs/ruleGroups'

export interface RuleChoice {
  key: string
  label: string
}

export interface RuleChoiceGroups {
  building: readonly string[]
  board: readonly string[]
}

export function ruleChoicesFor(
  rules: RuleChoice[],
  classification: { boardKind: string | null } | undefined,
  groups: RuleChoiceGroups,
): RuleChoice[] {
  if (classification === undefined) return rules
  const foreign = classification.boardKind === null ? groups.board : groups.building
  return rules.filter((r) => !inRuleGroup(r.key, foreign))
}
