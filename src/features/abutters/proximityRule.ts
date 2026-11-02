import type { ListAgeRule, ProximityRule } from '@packs/nh/schema'
import { addDays, type CivilDate, compareCivil } from '@/types/civilDate'

export interface ProximityVerdict {
  within: boolean
  layer: ProximityRule['layer']
  role: ProximityRule['recipientRole']
}

export function proximityVerdict(rule: ProximityRule, withinFt: number | null): ProximityVerdict {
  return {
    within: withinFt !== null && withinFt <= rule.distanceFt,
    layer: rule.layer,
    role: rule.recipientRole,
  }
}

export function listIsFreshAtFiling(
  rule: ListAgeRule,
  drawnOn: CivilDate,
  receivedDate: CivilDate,
): boolean {
  return compareCivil(drawnOn, addDays(receivedDate, -rule.maxDaysBeforeFiling)) >= 0
}
