import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { RTK_STATUSES, type RtkStatus, rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { anyOf, countFacets, facet, whereAll } from '@/features/dataTable/facets'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { DUE_WEEK_DAYS } from '@/features/queue/queueFilterSql'
import { DUE_FILTERS, type DueFilter } from '@/features/queue/queueParams'
import { rtkRequestVisibleTo } from '@/features/rtk/access'
import {
  REQUEST_SORT,
  type RequestListFilters,
  type RequestSortKey,
} from '@/features/rtk/requestListParams'
import { townToday } from '@/features/town/today'
import { addDays, type CivilDate } from '@/types/civilDate'

export interface RtkListRow {
  id: string
  number: string
  receivedOn: CivilDate
  description: string
  status: RtkStatus
  dueOn: CivilDate | null
  requesterName: string | null
}

export interface RtkRequestPage {
  rows: RtkListRow[]
  total: number
  offset: number
  prevOffset: number | null
  nextOffset: number | null
}

export interface RtkRequestFacets {
  statuses: ReadonlyMap<string, number>
  due: ReadonlyMap<string, number>
}

type ListGroup = 'statuses' | 'due'

const NO_DUE = '9999-12-31'
const AWAITING_RESPONSE = sql`${rtkRequests.status} in ('open', 'awaiting_decision')`

const STATUS_ORDER = sql`array_position(array[${sql.join(
  RTK_STATUSES.map((status) => sql`${status}`),
  sql`, `,
)}]::text[], ${rtkRequests.status})`

const SORT_COLUMNS: Readonly<Record<RequestSortKey, SQLWrapper>> = {
  number: rtkRequests.number,
  asked: rtkRequests.description,
  received: rtkRequests.receivedOn,
  status: STATUS_ORDER,
  due: rtkRequests.openDueOn,
}

const TIEBREAK: readonly SQL[] = [
  sql`coalesce(${rtkRequests.openDueOn}, ${NO_DUE}::date) asc`,
  sql`${rtkRequests.id} asc`,
]

function dueClause(value: DueFilter, today: CivilDate): SQL {
  switch (value) {
    case 'overdue':
      return sql`(${rtkRequests.openDueOn} < ${today}::date and ${AWAITING_RESPONSE})`
    case 'week':
      return sql`(${rtkRequests.openDueOn} >= ${today}::date and ${rtkRequests.openDueOn} <= ${addDays(today, DUE_WEEK_DAYS)}::date and ${AWAITING_RESPONSE})`
    case 'none':
      return sql`${rtkRequests.openDueOn} is null`
  }
}

function groupClauses(filters: RequestListFilters, today: CivilDate) {
  const statuses = filters.statuses ?? []
  return new Map<ListGroup, SQL | undefined>([
    ['statuses', statuses.length === 0 ? undefined : sql`${rtkRequests.status} in ${statuses}`],
    ['due', anyOf((filters.due ?? []).map((value) => dueClause(value, today)))],
  ])
}

function listWhere(
  actor: Actor,
  filters: RequestListFilters,
  today: CivilDate,
  except?: ListGroup,
) {
  return whereAll([rtkRequestVisibleTo(actor)], groupClauses(filters, today), except)
}

export async function listRtkRequestPage(
  db: Db,
  actor: Actor,
  input: {
    filters: RequestListFilters
    sort?: SortState<RequestSortKey>
    limit: number
    offset: number
    today?: CivilDate
  },
  signal: AbortSignal,
): Promise<RtkRequestPage> {
  signal.throwIfAborted()
  const today = input.today ?? (await townToday(db, new Date(), signal))
  const where = listWhere(actor, input.filters, today)
  const sort = input.sort ?? defaultSort(REQUEST_SORT)
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(rtkRequests).where(where)
  const rows = await db
    .select({
      id: rtkRequests.id,
      number: rtkRequests.number,
      receivedOn: rtkRequests.receivedOn,
      description: rtkRequests.description,
      status: rtkRequests.status,
      dueOn: rtkRequests.openDueOn,
      requesterName: rtkRequests.requesterName,
    })
    .from(rtkRequests)
    .where(where)
    .orderBy(...orderBySql(sort, SORT_COLUMNS, TIEBREAK))
    .limit(input.limit + 1)
    .offset(input.offset)
  return {
    rows: rows.slice(0, input.limit).map((r) => ({
      ...r,
      receivedOn: r.receivedOn as CivilDate,
      dueOn: r.dueOn as CivilDate | null,
    })),
    total: count?.n ?? 0,
    offset: input.offset,
    prevOffset: input.offset === 0 ? null : Math.max(0, input.offset - input.limit),
    nextOffset: rows.length > input.limit ? input.offset + input.limit : null,
  }
}

export async function rtkRequestFacets(
  db: Db,
  actor: Actor,
  input: { filters: RequestListFilters; today?: CivilDate },
  signal: AbortSignal,
): Promise<RtkRequestFacets> {
  signal.throwIfAborted()
  const today = input.today ?? (await townToday(db, new Date(), signal))
  const counts = await countFacets(db, {
    table: rtkRequests,
    scope: rtkRequestVisibleTo(actor),
    others: (group: ListGroup) => listWhere(actor, input.filters, today, group),
    facets: [
      facet('statuses', RTK_STATUSES, (status) => sql`${rtkRequests.status} = ${status}`),
      facet('due', DUE_FILTERS, (value) => dueClause(value, today)),
    ],
  })
  return { statuses: counts.get('statuses') ?? new Map(), due: counts.get('due') ?? new Map() }
}
