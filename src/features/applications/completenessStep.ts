import { loadPack, type Pack } from '@/features/packs/loadPack'
import { isBuildingPermit } from '@/features/packs/roles'
import type { ClockRule } from '@/features/packs/schema'

export type CompletenessStep = 'starts_decision_clock' | null

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
  return null
}

export function offersCompleteness(view: {
  isBuildingPermit: boolean
  classification?: string | null
}): boolean {
  return view.isBuildingPermit || completenessStepFor(view.classification) !== null
}
