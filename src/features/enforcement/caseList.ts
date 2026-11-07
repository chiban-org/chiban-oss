import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { ENFORCEMENT_STATUSES, enforcementCases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { anyOf, countFacets, facet, whereAll } from '@/features/dataTable/facets'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import type { Status } from '@/features/design/tokens'
import { enforcementCaseVisibleTo } from '@/features/enforcement/access'
import type { CaseListFilters, CaseSortKey } from '@/features/enforcement/caseListParams'
import { CASE_SORT } from '@/features/enforcement/caseListParams'
import { caseChipStatus } from '@/features/enforcement/chipStatus'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { stayRuleActive } from '@/features/enforcement/stay'
import { DUE_WEEK_DAYS } from '@/features/queue/queueFilterSql'
import {
  ASSIGNED_FILTERS,
  type AssignedFilter,
  DUE_FILTERS,
  type DueFilter,
} from '@/features/queue/queueParams'
import { addDays, type CivilDate } from '@/types/civilDate'

export interface CaseListRow {
  caseId: string
  number: string
  statusLabel: string
  statusChip: Status
  locationText: string
  openedOn: CivilDate
  nextDueOn: CivilDate | null
  nextDueKind: 'answer' | 'corrective' | null
  assignedToName: string | null
}

export interface CaseListPage {
  rows: CaseListRow[]
  total: number
  offset: number
  prevOffset: number | null
  nextOffset: number | null
}

export interface CaseListFacets {
  statuses: ReadonlyMap<string, number>
  due: ReadonlyMap<string, number>
  assigned: ReadonlyMap<string, number>
}

type ListGroup = 'statuses' | 'due' | 'assigned'

const ANSWER_DATE = sql`(r.answer_due->>'due')::date`

const LIVE_ORDER_STATUSES = ['issued', 'served', 'answered']

function liveOrder(today: CivilDate): SQL {
  return sql`${enforcementCases.status} = 'order_issued'
    and o.status in ${LIVE_ORDER_STATUSES}
    and not ${stayedOn(today)}`
}

function nextAnswerDue(today: CivilDate): SQL {
  return sql`(select min(${ANSWER_DATE}) from order_service_recipients r
    join enforcement_orders o on o.id = r.order_id
    where o.case_id = ${enforcementCases.id} and r.answer_due is not null
      and r.answered_on is null and ${liveOrder(today)})`
}

function nextCorrectiveDeadline(today: CivilDate): SQL {
  return sql`(select min(o.corrective_deadline) from enforcement_orders o
    where o.case_id = ${enforcementCases.id} and o.corrective_deadline >= ${today}::date
      and ${liveOrder(today)})`
}

function nextDate(today: CivilDate): SQL {
  return sql`least(${nextAnswerDue(today)}, ${nextCorrectiveDeadline(today)})`
}

function unansweredPastDue(today: CivilDate): SQL {
  return sql`exists (select 1 from order_service_recipients r
    join enforcement_orders o on o.id = r.order_id
    where o.case_id = ${enforcementCases.id} and r.answer_due is not null
      and r.answered_on is null and ${ANSWER_DATE} < ${today}::date
      and ${liveOrder(today)})`
}

function stayedOn(today: CivilDate): SQL {
  if (!stayRuleActive()) return sql`false`
  return sql`exists (select 1 from enforcement_appeals a
    where a.case_id = ${enforcementCases.id} and a.filed_on <= ${today}::date
      and (a.resolved_on is null or a.resolved_on > ${today}::date)
      and (not exists (select 1 from peril_certifications p
          where p.appeal_id = a.id and p.certified_on <= ${today}::date)
        or exists (select 1 from restraining_orders ro
          where ro.appeal_id = a.id and ro.issued_on <= ${today}::date
            and (ro.dissolved_on is null or ro.dissolved_on > ${today}::date))))`
}

function nextDateOf(
  answer: CivilDate | null,
  corrective: CivilDate | null,
): Pick<CaseListRow, 'nextDueOn' | 'nextDueKind'> {
  if (answer !== null && (corrective === null || answer <= corrective)) {
    return { nextDueOn: answer, nextDueKind: 'answer' }
  }
  if (corrective !== null) return { nextDueOn: corrective, nextDueKind: 'corrective' }
  return { nextDueOn: null, nextDueKind: null }
}

const ASSIGNEE_NAME = sql<string | null>`(select u.display_name from users u
  where u.id = ${enforcementCases.assignedTo})`

const STATUS_ORDER = sql`array_position(array[${sql.join(
  ENFORCEMENT_STATUSES.map((status) => sql`${status}`),
  sql`, `,
)}]::text[], ${enforcementCases.status})`

function sortColumns(today: CivilDate): Readonly<Record<CaseSortKey, SQLWrapper>> {
  return {
    number: enforcementCases.number,
    where: enforcementCases.locationText,
    status: STATUS_ORDER,
    opened: enforcementCases.openedOn,
    next: nextDate(today),
    stay: stayedOn(today),
    assigned: ASSIGNEE_NAME,
  }
}

const TIEBREAK: readonly SQL[] = [sql`${enforcementCases.number} desc`]

function dueClause(value: DueFilter, today: CivilDate): SQL {
  switch (value) {
    case 'overdue':
      return unansweredPastDue(today)
    case 'week':
      return sql`(${nextDate(today)} between ${today}::date and ${addDays(today, DUE_WEEK_DAYS)}::date)`
    case 'none':
      return sql`${nextDate(today)} is null`
  }
}

function assignedClause(value: AssignedFilter, actor: Actor | null): SQL {
  if (value === 'none') return sql`${enforcementCases.assignedTo} is null`
  return actor === null ? sql`false` : sql`${enforcementCases.assignedTo} = ${actor.userId}`
}

function groupClauses(actor: Actor | null, filters: CaseListFilters, today: CivilDate) {
  const statuses = filters.statuses ?? []
  return new Map<ListGroup, SQL | undefined>([
    [
      'statuses',
      statuses.length === 0 ? undefined : sql`${enforcementCases.status} in ${statuses}`,
    ],
    ['due', anyOf((filters.due ?? []).map((value) => dueClause(value, today)))],
    ['assigned', anyOf((filters.assigned ?? []).map((value) => assignedClause(value, actor)))],
  ])
}

function listWhere(
  actor: Actor | null,
  filters: CaseListFilters,
  today: CivilDate,
  except?: ListGroup,
) {
  return whereAll([enforcementCaseVisibleTo(actor)], groupClauses(actor, filters, today), except)
}

export async function listCasePage(
  db: DbOrTx,
  actor: Actor | null,
  input: {
    filters: CaseListFilters
    sort?: SortState<CaseSortKey>
    limit: number
    offset: number
  },
  today: CivilDate,
  signal: AbortSignal,
): Promise<CaseListPage> {
  signal.throwIfAborted()
  const where = listWhere(actor, input.filters, today)
  const sort = input.sort ?? defaultSort(CASE_SORT)
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enforcementCases)
    .where(where)
  const rows = await db
    .select({
      caseId: enforcementCases.id,
      number: enforcementCases.number,
      status: enforcementCases.status,
      locationText: enforcementCases.locationText,
      openedOn: enforcementCases.openedOn,
      nextAnswerOn: sql<string | null>`${nextAnswerDue(today)}::text`,
      nextCorrectiveOn: sql<string | null>`${nextCorrectiveDeadline(today)}::text`,
      assignedToName: ASSIGNEE_NAME,
    })
    .from(enforcementCases)
    .where(where)
    .orderBy(...orderBySql(sort, sortColumns(today), TIEBREAK))
    .limit(input.limit + 1)
    .offset(input.offset)
  return {
    rows: rows.slice(0, input.limit).map(({ status, nextAnswerOn, nextCorrectiveOn, ...row }) => ({
      ...row,
      statusLabel: CASE_STATUS_LABELS[status],
      statusChip: caseChipStatus(status),
      openedOn: row.openedOn as CivilDate,
      ...nextDateOf(nextAnswerOn as CivilDate | null, nextCorrectiveOn as CivilDate | null),
    })),
    total: count?.n ?? 0,
    offset: input.offset,
    prevOffset: input.offset === 0 ? null : Math.max(0, input.offset - input.limit),
    nextOffset: rows.length > input.limit ? input.offset + input.limit : null,
  }
}

export async function caseListFacets(
  db: DbOrTx,
  actor: Actor | null,
  input: { filters: CaseListFilters },
  today: CivilDate,
  signal: AbortSignal,
): Promise<CaseListFacets> {
  signal.throwIfAborted()
  const counts = await countFacets(db, {
    table: enforcementCases,
    scope: enforcementCaseVisibleTo(actor),
    others: (group: ListGroup) => listWhere(actor, input.filters, today, group),
    facets: [
      facet(
        'statuses',
        ENFORCEMENT_STATUSES,
        (status) => sql`${enforcementCases.status} = ${status}`,
      ),
      facet('due', DUE_FILTERS, (value) => dueClause(value, today)),
      facet('assigned', ASSIGNED_FILTERS, (value) => assignedClause(value, actor)),
    ],
  })
  return {
    statuses: counts.get('statuses') ?? new Map(),
    due: counts.get('due') ?? new Map(),
    assigned: counts.get('assigned') ?? new Map(),
  }
}
