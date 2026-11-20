import { packRoles, presentKeys } from '@/features/packs/roles'

export function boardDecisionClockKeys(): string[] {
  const { rules } = packRoles()
  return presentKeys([rules.planningBoardDecision, rules.zbaDecision])
}

export function decisionClockKeys(): string[] {
  return presentKeys([packRoles().rules.buildingPermitDecision, ...boardDecisionClockKeys()])
}
