import type { ClockRule } from '@packs/nh/schema'
import { addMonthsClamped, type CivilDate } from '@/types/civilDate'

export function relianceFloorDue(rule: ClockRule, resolvedOn: CivilDate): CivilDate | null {
  return rule.relianceFloorMonths === undefined
    ? null
    : addMonthsClamped(resolvedOn, rule.relianceFloorMonths)
}
