import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { DocumentItem, DocumentStage } from '@/features/applications/documentItemSchema'
import type { CoreState } from '@/features/applications/states'
import { type ConditionValues, evaluateCondition } from '@/features/forms/condition'

export type ItemStatus =
  | 'provided'
  | 'accepted'
  | 'waiver_requested'
  | 'not_needed'
  | 'optional'
  | 'missing'

export interface ItemRecord {
  documentIds: readonly string[]
  waiverRequested: boolean
  accepted: boolean
}

const NO_RECORD: ItemRecord = { documentIds: [], waiverRequested: false, accepted: false }

export function itemApplies(item: DocumentItem, values: ConditionValues): boolean {
  return item.requiredIf === undefined || evaluateCondition(item.requiredIf, values)
}

export function itemStatus(
  item: DocumentItem,
  values: ConditionValues,
  record: ItemRecord = NO_RECORD,
): ItemStatus {
  if (record.documentIds.length > 0) return 'provided'
  if (record.accepted) return 'accepted'
  if (record.waiverRequested && item.waivable) return 'waiver_requested'
  if (!itemApplies(item, values)) return 'not_needed'
  return item.optional === true ? 'optional' : 'missing'
}

export function unmetItems(
  items: readonly DocumentItem[],
  stages: readonly DocumentStage[],
  values: ConditionValues,
  records: ReadonlyMap<string, ItemRecord> = new Map(),
): DocumentItem[] {
  return items.filter(
    (item) =>
      stages.includes(item.stage) && itemStatus(item, values, records.get(item.key)) === 'missing',
  )
}

type ClosesOn = ApplicationTypeBody['workflow']['closesOn']

export function gatedStages(to: CoreState, closesOn: ClosesOn): DocumentStage[] {
  if (to === 'submitted') return ['to_file']
  if (to === 'decided') return ['before_decision']
  if (to === 'issued') return ['before_decision', 'before_issue']
  if (to === 'closed' && closesOn === 'certificate_of_occupancy') return ['before_co']
  return []
}

const OPEN_STATES: ReadonlyMap<DocumentStage, readonly CoreState[]> = new Map([
  ['to_file', ['draft', 'submitted']],
  ['before_decision', ['draft', 'submitted', 'under_review']],
  ['before_issue', ['draft', 'submitted', 'under_review', 'decided']],
  ['before_co', ['draft', 'submitted', 'under_review', 'decided', 'issued']],
])

export function stageOpenFor(stage: DocumentStage, state: CoreState): boolean {
  return OPEN_STATES.get(stage)?.includes(state) ?? false
}

export function missingNames(items: readonly DocumentItem[]): string {
  return items.map((i) => i.label.replace(/\.+$/, '')).join('; ')
}
