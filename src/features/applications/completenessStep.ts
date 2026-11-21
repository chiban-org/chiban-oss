import { loadPack, type Pack } from '@/features/packs/loadPack'
import { isBuildingPermit } from '@/features/packs/roles'
import type { ClockRule } from '@/features/packs/schema'
import { formatCivilDate } from '@/lib/formatDate'

export type CompletenessStep =
  | 'starts_decision_clock'
  | 'decision_clock_running'
  | 'meets_completeness_clock'
  | null

function classificationClocks(classification: string | undefined, pack: Pack): ClockRule[] {
  const keys = new Set(
    pack.classifications.find((c) => c.key === classification)?.mandatoryRuleKeys ?? [],
  )
  return pack.rules.filter((r): r is ClockRule => r.kind === 'clock' && keys.has(r.key))
}

function buildingPermitDecisionRunsFromReceipt(pack: Pack): boolean {
  const key = pack.roles.rules.buildingPermitDecision
  const rule = pack.rules.find((r): r is ClockRule => r.kind === 'clock' && r.key === key)
  return rule?.startEvent === 'application_received'
}

export function completenessStepFor(
  classification: string | null | undefined,
  pack: Pack = loadPack(),
): CompletenessStep {
  const key = classification ?? undefined
  if (isBuildingPermit(key)) {
    return buildingPermitDecisionRunsFromReceipt(pack)
      ? 'decision_clock_running'
      : 'starts_decision_clock'
  }
  const clocks = classificationClocks(key, pack)
  if (clocks.some((r) => r.startEvent === 'application_completed')) return 'starts_decision_clock'
  if (clocks.some((r) => r.satisfiedByCompletion === true)) return 'meets_completeness_clock'
  return null
}

export function offersCompleteness(view: {
  isBuildingPermit: boolean
  classification?: string | null
}): boolean {
  return view.isBuildingPermit || completenessStepFor(view.classification) !== null
}

export interface CompletenessCopy {
  pending: string
  detail: string
  marked: string
}

const DECISION_CLOCK_COPY: CompletenessCopy = {
  pending: 'The application has not been marked complete, so the decision clock has not started.',
  detail: 'The decision clock starts when the application is marked complete.',
  marked: 'Marked complete. The decision clock is running.',
}

const COMPLETENESS_CLOCK_COPY: CompletenessCopy = {
  pending: 'The application has not been marked complete.',
  detail: 'Marking the application complete meets its completeness review date.',
  marked: 'Marked complete. The completeness review date is met.',
}

function runningDecisionCopy(due: string | null): CompletenessCopy {
  const fallsOn = due === null ? '' : ` and falls on ${formatCivilDate(due)}`
  return {
    pending: `The application has not been marked complete. The decision deadline already runs from filing${fallsOn}.`,
    detail: `The decision deadline runs from filing${fallsOn}. Marking the application complete does not change it.`,
    marked: 'Marked complete. The decision deadline runs from filing.',
  }
}

export interface CompletenessView {
  isBuildingPermit: boolean
  classification?: string | null
  clocks?: readonly { ruleKey: string; currentDue: { value: string } }[]
}

function decisionDue(view: CompletenessView, pack: Pack): string | null {
  const key = pack.roles.rules.buildingPermitDecision
  return view.clocks?.find((c) => c.ruleKey === key)?.currentDue.value ?? null
}

export function completenessCopy(
  view: CompletenessView,
  pack: Pack = loadPack(),
): CompletenessCopy {
  const step = completenessStepFor(view.classification, pack)
  if (view.isBuildingPermit && step === 'decision_clock_running') {
    return runningDecisionCopy(decisionDue(view, pack))
  }
  return !view.isBuildingPermit && step === 'meets_completeness_clock'
    ? COMPLETENESS_CLOCK_COPY
    : DECISION_CLOCK_COPY
}
