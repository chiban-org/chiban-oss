import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { packRoles, presentKeys } from '@/features/packs/roles'

function metByDeciding(key: string): boolean {
  const rule = ruleByKey(loadPack(), key)
  return !(rule.kind === 'clock' && rule.consequence.kind === 'deemed_refused')
}

export function boardDecisionDeadlineKeys(): string[] {
  const { rules } = packRoles()
  return presentKeys([rules.planningBoardDecision, rules.zbaDecision])
}

export function decisionDeadlineKeys(): string[] {
  return presentKeys([packRoles().rules.buildingPermitDecision, ...boardDecisionDeadlineKeys()])
}

export function boardDecisionClockKeys(): string[] {
  return boardDecisionDeadlineKeys().filter(metByDeciding)
}

export function decisionClockKeys(): string[] {
  return decisionDeadlineKeys().filter(metByDeciding)
}
