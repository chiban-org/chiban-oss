import { loadPack, type Pack } from '@/features/packs/loadPack'
import { isBuildingPermit } from '@/features/packs/roles'
import type { ClockRule } from '@/features/packs/schema'

export type CompletenessStep = 'starts_decision_clock' | 'meets_completeness_clock' | null

function classificationClocks(classification: string | undefined, pack: Pack): ClockRule[] {
  const keys = new Set(
    pack.classifications.find((c) => c.key === classification)?.mandatoryRuleKeys ?? [],
  )
  return pack.rules.filter((r): r is ClockRule => r.kind === 'clock' && keys.has(r.key))
}

export function completenessStepFor(
  classification: string | null | undefined,
  pack: Pack = loadPack(),
): CompletenessStep {
  const key = classification ?? undefined
  if (isBuildingPermit(key)) return 'starts_decision_clock'
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

export function completenessCopy(view: {
  isBuildingPermit: boolean
  classification?: string | null
}): CompletenessCopy {
  return !view.isBuildingPermit &&
    completenessStepFor(view.classification) === 'meets_completeness_clock'
    ? COMPLETENESS_CLOCK_COPY
    : DECISION_CLOCK_COPY
}
