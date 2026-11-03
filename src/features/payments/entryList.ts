import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { ledgerEntries, receipts } from '@/db/schema'
import { anyOf, countFacets, facet, whereAll } from '@/features/dataTable/facets'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { LEDGER_ENTRY_TYPES, PAYMENT_METHODS } from '@/features/ledger/types'
import {
  ENTRY_SORT,
  type EntryFilters,
  type EntrySortKey,
} from '@/features/payments/entryListParams'
import type { CivilDate } from '@/types/civilDate'

export interface EntryView {
  filters: EntryFilters
  sort?: SortState<EntrySortKey>
}

export interface EntryFacets {
  methods: ReadonlyMap<string, number>
  types: ReadonlyMap<string, number>
}

type ListGroup = 'methods' | 'types'

const ENTRY_LIMIT = 100

const APPLICATION_NUMBER = sql`(select min(n) from (
  select a.number as n from ledger_allocations la
    join applications a on a.id = la.application_id where la.entry_id = ${ledgerEntries.id}
  union all
  select c.number as n from ledger_allocations la
    join enforcement_fines f on f.id = la.fine_id
    join enforcement_cases c on c.id = f.case_id where la.entry_id = ${ledgerEntries.id}) t)`

const SORT_COLUMNS: Readonly<Record<EntrySortKey, SQLWrapper>> = {
  newest: ledgerEntries.postedAt,
  entry: sql`${ledgerEntries.entryType} || ' ' || ${ledgerEntries.method}`,
  amount: ledgerEntries.amountCents,
  payer: ledgerEntries.payerName,
  application: APPLICATION_NUMBER,
  receipt: receipts.number,
}

const TIEBREAK: readonly SQL[] = [sql`${ledgerEntries.postedAt} desc`, sql`${ledgerEntries.id} asc`]

function groupClauses(filters: EntryFilters) {
  const methods = filters.methods ?? []
  const types = filters.types ?? []
  return new Map<ListGroup, SQL | undefined>([
    ['methods', anyOf(methods.map((method) => sql`${ledgerEntries.method} = ${method}`))],
    ['types', anyOf(types.map((type) => sql`${ledgerEntries.entryType} = ${type}`))],
  ])
}

const onDate = (date: CivilDate) => sql`${ledgerEntries.businessDate} = ${date}`

export async function listEntriesOn(db: Db, date: CivilDate, view: EntryView) {
  return await db
    .select({
      id: ledgerEntries.id,
      entryType: ledgerEntries.entryType,
      method: ledgerEntries.method,
      amountCents: ledgerEntries.amountCents,
      payerName: ledgerEntries.payerName,
      receiptId: ledgerEntries.receiptId,
      receiptNumber: receipts.number,
    })
    .from(ledgerEntries)
    .leftJoin(receipts, sql`${receipts.id} = ${ledgerEntries.receiptId}`)
    .where(whereAll([onDate(date)], groupClauses(view.filters)))
    .orderBy(...orderBySql(view.sort ?? defaultSort(ENTRY_SORT), SORT_COLUMNS, TIEBREAK))
    .limit(ENTRY_LIMIT)
}

export async function entryFacetsOn(
  db: Db,
  date: CivilDate,
  filters: EntryFilters,
): Promise<EntryFacets> {
  const counts = await countFacets(db, {
    table: ledgerEntries,
    scope: onDate(date),
    others: (group: ListGroup) => whereAll([onDate(date)], groupClauses(filters), group),
    facets: [
      facet('methods', PAYMENT_METHODS, (method) => sql`${ledgerEntries.method} = ${method}`),
      facet('types', LEDGER_ENTRY_TYPES, (type) => sql`${ledgerEntries.entryType} = ${type}`),
    ],
  })
  return { methods: counts.get('methods') ?? new Map(), types: counts.get('types') ?? new Map() }
}
