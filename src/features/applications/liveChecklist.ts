import type { ItemStatus } from '@/features/applications/documentChecklist'
import { type Condition, type ConditionValues, evaluateCondition } from '@/features/forms/condition'

export interface DocumentRequirement {
  label: string
  requiredIf: Condition | null
  optional: boolean
  settled: boolean
}

const SETTLED: ReadonlySet<ItemStatus> = new Set(['provided', 'accepted', 'waiver_requested'])

export function isSettledStatus(status: ItemStatus): boolean {
  return SETTLED.has(status)
}

export function requirementApplies(requiredIf: Condition | null, values: ConditionValues): boolean {
  return requiredIf === null || evaluateCondition(requiredIf, values)
}

export function liveStatus(
  row: { status: ItemStatus; requiredIf: Condition | null; optional: boolean },
  values: ConditionValues,
): ItemStatus {
  if (isSettledStatus(row.status)) return row.status
  if (!requirementApplies(row.requiredIf, values)) return 'not_needed'
  return row.optional ? 'optional' : 'missing'
}

export function missingRequirements(
  requirements: readonly DocumentRequirement[],
  values: ConditionValues,
): string[] {
  return requirements
    .filter((r) => !r.settled && !r.optional && requirementApplies(r.requiredIf, values))
    .map((r) => r.label)
}
