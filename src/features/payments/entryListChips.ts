import type { TableParams } from '@/features/dataTable/params'
import { type ChipGroupView, chipGroups, labeledOptions } from '@/features/dataTable/quickFilters'
import type { EntryFacets } from '@/features/payments/entryList'
import { PAYMENTS_PATH } from '@/features/payments/entryListParams'
import { ENTRY_TYPE_LABELS, METHOD_LABELS } from '@/features/payments/labels'

export function entryChipGroups(params: TableParams, facets: EntryFacets): ChipGroupView[] {
  return chipGroups(PAYMENTS_PATH, params, [
    { param: 'method', label: 'Method', options: labeledOptions(METHOD_LABELS, facets.methods) },
    { param: 'type', label: 'Entry', options: labeledOptions(ENTRY_TYPE_LABELS, facets.types) },
  ])
}
