import { activePack } from '@/features/packs/registry'
import type { DecisionOutcome, ProceedingClassification } from '@/features/packs/schema'

export const SIGNIFICANCE_QUESTION =
  'Is this a significant land use decision (large buildings, more than 3 acres, or 10 or more lots)?'

export interface SignificanceQuestion {
  help: string | null
}

export function significanceApplies(classification: ProceedingClassification | undefined): boolean {
  return classification?.significanceApplies === true
}

export function significanceQuestion(
  classification: ProceedingClassification | undefined,
): SignificanceQuestion | null {
  if (!significanceApplies(classification)) return null
  return { help: activePack().labels.significantDecisionHelp }
}

function asksSignificance(
  classification: ProceedingClassification | undefined,
  outcome: DecisionOutcome,
): boolean {
  return significanceApplies(classification) && !outcome.startsWith('rehearing')
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
