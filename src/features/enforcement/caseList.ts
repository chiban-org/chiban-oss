import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { ENFORCEMENT_STATUSES, type EnforcementStatus, enforcementCases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { anyOf, countFacets, facet, whereAll } from '@/features/dataTable/facets'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import type { Status } from '@/features/design/tokens'
import { enforcementCaseVisibleTo } from '@/features/enforcement/access'
import { type CaseDueIndex, loadCaseDueIndex } from '@/features/enforcement/caseDueIndex'
import type { CaseListFilters, CaseSortKey } from '@/features/enforcement/caseListParams'
import { CASE_SORT } from '@/features/enforcement/caseListParams'
import { caseChipStatus } from '@/features/enforcement/chipStatus'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { stayRuleActive } from '@/features/enforcement/stay'
import type { CaseDue } from '@/features/enforcement/workPlanTypes'
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
  status: EnforcementStatus
  statusLabel: string
  statusChip: Status
  locationText: string
  openedOn: CivilDate
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

function dueDates(index: CaseDueIndex): SQL {
  const pairs = [...index.dues].map(([caseId, due]) => sql`(${caseId}::uuid, ${due.date}::date)`)
  if (pairs.length === 0) return sql`null::date`
  return sql`(select v.due from (values ${sql.join(pairs, sql`, `)}) as v(id, due)
    where v.id = ${enforcementCases.id})`
}

function inCases(caseIds: string[]): SQL {
  return caseIds.length === 0 ? sql`false` : sql`${enforcementCases.id} in ${caseIds}`
}

function casesDue(index: CaseDueIndex, within: (due: CaseDue) => boolean): SQL {
  return inCases([...index.dues].filter(([, due]) => within(due)).map(([caseId]) => caseId))
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

const ASSIGNEE_NAME = sql<string | null>`(select u.display_name from users u
  where u.id = ${enforcementCases.assignedTo})`

const STATUS_ORDER = sql`array_position(array[${sql.join(
  ENFORCEMENT_STATUSES.map((status) => sql`${status}`),
  sql`, `,
)}]::text[], ${enforcementCases.status})`

function sortColumns(
  today: CivilDate,
  index: CaseDueIndex,
): Readonly<Record<CaseSortKey, SQLWrapper>> {
  return {
    number: enforcementCases.number,
    where: enforcementCases.locationText,
    status: STATUS_ORDER,
    opened: enforcementCases.openedOn,
    next: dueDates(index),
    stay: stayedOn(today),
    assigned: ASSIGNEE_NAME,
  }
}

const TIEBREAK: readonly SQL[] = [sql`${enforcementCases.number} desc`]

function dueClause(value: DueFilter, today: CivilDate, index: CaseDueIndex): SQL {
  switch (value) {
    case 'overdue':
      return casesDue(index, (due) => due.date < today)
    case 'week':
      return casesDue(
        index,
        (due) => due.date >= today && due.date <= addDays(today, DUE_WEEK_DAYS),
      )
    case 'none':
      return sql`not (${casesDue(index, () => true)})`
  }
}

function assignedClause(value: AssignedFilter, actor: Actor | null): SQL {
  if (value === 'none') return sql`${enforcementCases.assignedTo} is null`
  return actor === null ? sql`false` : sql`${enforcementCases.assignedTo} = ${actor.userId}`
}

function groupClauses(
  actor: Actor | null,
  filters: CaseListFilters,
  today: CivilDate,
  index: CaseDueIndex,
) {
  const statuses = filters.statuses ?? []
  return new Map<ListGroup, SQL | undefined>([
    [
      'statuses',
      statuses.length === 0 ? undefined : sql`${enforcementCases.status} in ${statuses}`,
    ],
    ['due', anyOf((filters.due ?? []).map((value) => dueClause(value, today, index)))],
    ['assigned', anyOf((filters.assigned ?? []).map((value) => assignedClause(value, actor)))],
  ])
}

function listWhere(
  actor: Actor | null,
  filters: CaseListFilters,
  today: CivilDate,
  index: CaseDueIndex,
  except?: ListGroup,
) {
  return whereAll(
    [enforcementCaseVisibleTo(actor)],
    groupClauses(actor, filters, today, index),
    except,
  )
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
  index?: CaseDueIndex,
): Promise<CaseListPage> {
  signal.throwIfAborted()
  const due = index ?? (await loadCaseDueIndex(db, actor, today, signal))
  const where = listWhere(actor, input.filters, today, due)
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
      assignedToName: ASSIGNEE_NAME,
    })
    .from(enforcementCases)
    .where(where)
    .orderBy(...orderBySql(sort, sortColumns(today, due), TIEBREAK))
    .limit(input.limit + 1)
    .offset(input.offset)
  return {
    rows: rows.slice(0, input.limit).map(({ status, ...row }) => ({
      ...row,
      status,
      statusLabel: CASE_STATUS_LABELS[status],
      statusChip: caseChipStatus(status),
      openedOn: row.openedOn as CivilDate,
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
  index?: CaseDueIndex,
): Promise<CaseListFacets> {
  signal.throwIfAborted()
  const due = index ?? (await loadCaseDueIndex(db, actor, today, signal))
  const counts = await countFacets(db, {
    table: enforcementCases,
    scope: enforcementCaseVisibleTo(actor),
    others: (group: ListGroup) => listWhere(actor, input.filters, today, due, group),
    facets: [
      facet(
        'statuses',
        ENFORCEMENT_STATUSES,
        (status) => sql`${enforcementCases.status} = ${status}`,
      ),
      facet('due', DUE_FILTERS, (value) => dueClause(value, today, due)),
      facet('assigned', ASSIGNED_FILTERS, (value) => assignedClause(value, actor)),
    ],
  })
  return {
    statuses: counts.get('statuses') ?? new Map(),
    due: counts.get('due') ?? new Map(),
    assigned: counts.get('assigned') ?? new Map(),
  }
}
