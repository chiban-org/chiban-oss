import { activePack } from '@/features/packs/registry'
import type { DecisionOutcome, ProceedingClassification } from '@/features/packs/schema'

export interface SignificanceQuestion {
  question: string
  help: string | null
}

export function significanceApplies(classification: ProceedingClassification | undefined): boolean {
  return classification?.significanceApplies === true
}

export function significanceQuestion(
  classification: ProceedingClassification | undefined,
): SignificanceQuestion | null {
  const { significantDecisionQuestion, significantDecisionHelp } = activePack().labels
  if (!significanceApplies(classification) || significantDecisionQuestion === null) return null
  return { question: significantDecisionQuestion, help: significantDecisionHelp }
}

function asksSignificance(
  classification: ProceedingClassification | undefined,
  outcome: DecisionOutcome,
): boolean {
  return significanceQuestion(classification) !== null && !outcome.startsWith('rehearing')
}

export function storedSignificance(
  classification: ProceedingClassification | undefined,
  outcome: DecisionOutcome,
  significant: boolean | undefined,
): boolean | null {
  return asksSignificance(classification, outcome) ? (significant ?? null) : null
}

export function significanceMissing(
  classification: ProceedingClassification | undefined,
  outcome: DecisionOutcome,
  significant: boolean | undefined,
): boolean {
  return asksSignificance(classification, outcome) && significant === undefined
}
