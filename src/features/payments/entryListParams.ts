import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { filterValues, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import {
  LEDGER_ENTRY_TYPES,
  type LedgerEntryType,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@/features/ledger/types'

export const PAYMENTS_PATH = '/staff/payments'

export type EntrySortKey = 'newest' | 'entry' | 'amount' | 'payer' | 'application' | 'receipt'

export const ENTRY_SORT: SortConfig<EntrySortKey> = {
  defaultKey: 'newest',
  columns: {
    newest: 'desc',
    entry: 'asc',
    amount: 'desc',
    payer: 'asc',
    application: 'asc',
    receipt: 'asc',
  },
}

export const ENTRY_FILTER_PARAMS = ['method', 'type'] as const

export interface EntryFilters {
  methods?: PaymentMethod[]
  types?: LedgerEntryType[]
}

export interface EntriesView {
  params: TableParams
  sort: SortState<EntrySortKey>
  filters: EntryFilters
}

export function readEntriesView(raw: RawSearchParams): EntriesView {
  const params = readTableParams(raw)
  return {
    params,
    sort: parseSort(ENTRY_SORT, params),
    filters: {
      ...whenAny('methods', filterValues(params, 'method', PAYMENT_METHODS)),
      ...whenAny('types', filterValues(params, 'type', LEDGER_ENTRY_TYPES)),
    },
  }
}
