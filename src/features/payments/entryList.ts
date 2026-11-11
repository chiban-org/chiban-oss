import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { ledgerEntries, receipts } from '@/db/schema'
import { anyOf, countFacets, facet, whereAll } from '@/features/dataTable/facets'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { LEDGER_ENTRY_TYPES, PAYMENT_METHODS } from '@/features/ledger/types'
import {
  ENTRY_PAGE_SIZE,
  ENTRY_RANGES,
  ENTRY_SORT,
  type EntryFilters,
  type EntryRange,
  type EntrySortKey,
} from '@/features/payments/entryListParams'
import { addDays, type CivilDate } from '@/types/civilDate'

export interface EntryView {
  filters: EntryFilters
  sort?: SortState<EntrySortKey>
  range?: EntryRange
  offset?: number
  limit?: number
}

export type RangeCounts = Record<EntryRange, number>

export interface EntryFacets {
  methods: ReadonlyMap<string, number>
  types: ReadonlyMap<string, number>
}

type ListGroup = 'methods' | 'types'

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

export function weekStart(date: CivilDate): CivilDate {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, -((weekday + 6) % 7))
}

function inRange(range: EntryRange, date: CivilDate): SQL {
  if (range === 'all') return sql`true`
  if (range === 'today') return sql`${ledgerEntries.businessDate} = ${date}`
  return sql`${ledgerEntries.businessDate} >= ${weekStart(date)} and ${ledgerEntries.businessDate} <= ${date}`
}

export async function listEntriesOn(db: Db, date: CivilDate, view: EntryView) {
  const range = view.range ?? 'today'
  return await db
    .select({
      id: ledgerEntries.id,
      entryType: ledgerEntries.entryType,
      method: ledgerEntries.method,
      amountCents: ledgerEntries.amountCents,
      payerName: ledgerEntries.payerName,
      receiptId: ledgerEntries.receiptId,
      receiptNumber: receipts.number,
      paymentAttemptId: ledgerEntries.paymentAttemptId,
    })
    .from(ledgerEntries)
    .leftJoin(receipts, sql`${receipts.id} = ${ledgerEntries.receiptId}`)
    .where(whereAll([inRange(range, date)], groupClauses(view.filters)))
    .orderBy(...orderBySql(view.sort ?? defaultSort(ENTRY_SORT), SORT_COLUMNS, TIEBREAK))
    .limit(view.limit ?? ENTRY_PAGE_SIZE)
    .offset(Math.max(view.offset ?? 0, 0))
}

export async function rangeCountsOn(
  db: Db,
  date: CivilDate,
  filters: EntryFilters,
): Promise<RangeCounts> {
  const where = whereAll([], groupClauses(filters))
  const columns = ENTRY_RANGES.map((range): [string, SQL<number>] => [
    range,
    sql<number>`(count(*) filter (where ${inRange(range, date)}))::int`,
  ])
  const [row] = await db.select(Object.fromEntries(columns)).from(ledgerEntries).where(where)
  return { today: row?.today ?? 0, week: row?.week ?? 0, all: row?.all ?? 0 }
}

export async function entryFacetsOn(
  db: Db,
  date: CivilDate,
  filters: EntryFilters,
  range: EntryRange = 'today',
): Promise<EntryFacets> {
  const counts = await countFacets(db, {
    table: ledgerEntries,
    scope: inRange(range, date),
    others: (group: ListGroup) => whereAll([inRange(range, date)], groupClauses(filters), group),
    facets: [
      facet('methods', PAYMENT_METHODS, (method) => sql`${ledgerEntries.method} = ${method}`),
      facet('types', LEDGER_ENTRY_TYPES, (type) => sql`${ledgerEntries.entryType} = ${type}`),
    ],
  })
  return { methods: counts.get('methods') ?? new Map(), types: counts.get('types') ?? new Map() }
}
