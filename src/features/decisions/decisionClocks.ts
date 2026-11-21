import { keysSatisfiedByDecision } from '@/features/clocks/ruleEngine'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles, presentKeys } from '@/features/packs/roles'

function metByDeciding(key: string): boolean {
  const rule = ruleByKey(loadPack(), key)
  return !(rule.kind === 'clock' && rule.consequence.kind === 'deemed_refused')
}

function satisfiedByDecisionKeys(): string[] {
  return keysSatisfiedByDecision(loadPack().rules)
}

function withSatisfiedByDecision(keys: string[]): string[] {
  return [...new Set([...keys, ...satisfiedByDecisionKeys()])]
}

export function boardDecisionDeadlineKeys(): string[] {
  const { rules } = packRoles()
  return withSatisfiedByDecision(presentKeys([rules.planningBoardDecision, rules.zbaDecision]))
}

export function decisionDeadlineKeys(): string[] {
  return withSatisfiedByDecision(
    presentKeys([packRoles().rules.buildingPermitDecision, ...boardDecisionDeadlineKeys()]),
  )
}

export function boardDecisionClockKeys(): string[] {
  return boardDecisionDeadlineKeys().filter(metByDeciding)
}

export function decisionClockKeys(): string[] {
  return decisionDeadlineKeys().filter(metByDeciding)
}
