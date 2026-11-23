import { activePack } from '@/features/packs/registry'
import { boardShort, rehearingWords } from '@/features/packs/vocabulary'

function officials(): readonly string[] {
  return activePack().labels.administrativeOfficials
}

export function officialsOrAnother(): string {
  return `the ${officials().join(', ')} or another town official`
}

export function officialsOr(): string {
  const titles = officials()
  const last = titles.at(-1) ?? ''
  const rest = titles.slice(0, -1)
  return rest.length === 0 ? `the ${last}` : `the ${rest.join(', ')} or ${last}`
}

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
  return `A decision by ${officialsOrAnother()} on an application or permit. Recording it starts the time to appeal it to the ${boardShort('zba')}.`
}

export function appealsLead(): string {
  return `Decisions by ${officialsOrAnother()} that can be appealed to the ${boardShort('zba')}.`
}

export function appealPointer(): string {
  return `To appeal a decision by ${officialsOr()} to the ${boardShort('zba')},`
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

export type AppealStepKey =
  | 'zba_appeal'
  | 'zba_decision'
  | 'rehearing_motion'
  | 'rehearing_outcome'
  | 'court_petition'

function appealStepLabel(key: AppealStepKey): string {
  switch (key) {
    case 'zba_appeal':
      return appealToBoard()
    case 'zba_decision':
      return boardDecision()
    case 'rehearing_motion':
      return motionForRehearing()
    case 'rehearing_outcome':
      return rehearingDecision()
    case 'court_petition':
      return 'Court petition'
  }
}

export function appealStepOptions(order: readonly AppealStepKey[]): [string, string][] {
  return order.map((key): [string, string] => [key, appealStepLabel(key)])
}
