import type { DecisionOutcome, RecordRule } from '@packs/nh/schema'

export function requiredDecisionFields(rule: RecordRule, outcome: DecisionOutcome): string[] {
  const conditional = rule.conditionalFields ?? []
  return rule.fields.filter((field) => {
    const gate = conditional.find((c) => c.field === field)
    return gate === undefined || gate.outcomes.includes(outcome)
  })
}
