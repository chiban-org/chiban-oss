import { boardShort, rehearingWords } from '@/features/packs/vocabulary'

export function appealToBoard(): string {
  return `Appeal to the ${boardShort('zba')}`
}

export function boardDecision(): string {
  return `${boardShort('zba')} decision`
}

export function appealStepHint(): string {
  return `For an appeal to the ${boardShort('zba')}. An appeal of an issued permit suspends it.`
}

export function appealResultLabel(): string {
  return `Result, for a ${boardShort('zba')} or ${rehearingWords().noun} decision`
}

export function linkedPlanningDecisionLabel(): string {
  return `Is this the ${boardShort('zba')} part of a ${boardShort('planning_board')} decision?`
}

export function recordDecisionDescription(): string {
  return `A decision by the building inspector, zoning administrator or another town official on an application or permit. Recording it starts the time to appeal it to the ${boardShort('zba')}.`
}

export function appealsLead(): string {
  return `Decisions by the building inspector, zoning administrator or another town official that can be appealed to the ${boardShort('zba')}.`
}

export function appealPointer(): string {
  return `To appeal a decision by the building inspector or zoning administrator to the ${boardShort('zba')},`
}

export function motionForRehearing(): string {
  return `Motion for ${rehearingWords().noun}`
}

export function rehearingDecision(): string {
  return `${rehearingWords().capitalised} decision`
}

export function rehearingGrantedLabel(): string {
  return `${rehearingWords().capitalised} granted`
}

export function appealStepResultLabel(): string {
  return `Result, for a ${rehearingWords().noun} decision or a decision after appeal`
}
