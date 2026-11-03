import { and, inArray, or, type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import { applications, reviewAssignments, users } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import { CORE_STATES } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import type {
  AssignedFilter,
  DueFilter,
  FlagFilter,
  QueueSortKey,
} from '@/features/queue/queueParams'
import {
  FEES_DUE,
  FILING_DUE,
  NEXT_DUE,
  NOTICE_DUE,
  preservationIncompleteFor,
  UNKNOWN_PAYMENT,
} from '@/features/queue/queueSql'
import { NEEDS_ACTION_STATES } from '@/features/queue/stateScopes'
import type { WorkQueueFilters } from '@/features/queue/workQueue'
import { addDays, type CivilDate } from '@/types/civilDate'

export const DUE_WEEK_DAYS = 7

const NEEDS_ACTION = sql`(${inArray(applications.state, [...NEEDS_ACTION_STATES])}
  or (${applications.state} <> 'draft'
    and (${NEXT_DUE} is not null or ${FILING_DUE} is not null or ${NOTICE_DUE} is not null)))`

const ACTIVE_ASSIGNMENT = sql`select 1 from review_assignments ra
  where ra.application_id = ${applications.id} and ra.removed_at is null`

export function dueClause(value: DueFilter, today: CivilDate): SQL {
  switch (value) {
    case 'overdue':
      return sql`${NEXT_DUE} < ${today}::date`
    case 'week':
      return sql`(${NEXT_DUE} >= ${today}::date and ${NEXT_DUE} <= ${addDays(today, DUE_WEEK_DAYS)}::date)`
    case 'none':
      return sql`${NEXT_DUE} is null`
  }
}

export function assignedClause(value: AssignedFilter, actor: Actor): SQL {
  return value === 'me'
    ? sql`exists (${ACTIVE_ASSIGNMENT} and ra.reviewer_user_id = ${actor.userId})`
    : sql`not exists (${ACTIVE_ASSIGNMENT})`
}

export function flagClause(value: FlagFilter, actor: Actor): SQL {
  switch (value) {
    case 'fees':
      return sql`${FEES_DUE} > 0`
    case 'payment':
      return UNKNOWN_PAYMENT
    case 'preservation':
      return preservationIncompleteFor(actor)
  }
}

export function anyOf(clauses: SQL[]): SQL | undefined {
  return clauses.length === 0 ? undefined : or(...clauses)
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function scopeClauses(actor: Actor, filters: WorkQueueFilters): (SQL | undefined)[] {
  const states = filters.states
  const search = filters.numberContains ?? ''
  return [
    applicationVisibleTo(actor),
    states === undefined ? NEEDS_ACTION : inArray(applications.state, states),
    search === '' ? undefined : sql`${applications.number} ilike ${`%${escapeLike(search)}%`}`,
  ]
}

export type QueueGroup = 'due' | 'assigned' | 'types' | 'flags'

export function groupClauses(
  actor: Actor,
  filters: WorkQueueFilters,
  today: CivilDate,
): ReadonlyMap<QueueGroup, SQL | undefined> {
  const types = filters.typeKeys ?? []
  return new Map<QueueGroup, SQL | undefined>([
    ['due', anyOf((filters.due ?? []).map((v) => dueClause(v, today)))],
    ['assigned', anyOf((filters.assigned ?? []).map((v) => assignedClause(v, actor)))],
    ['types', types.length === 0 ? undefined : inArray(applications.applicationTypeKey, types)],
    ['flags', anyOf((filters.flags ?? []).map((v) => flagClause(v, actor)))],
  ])
}

export function queueWhere(
  actor: Actor,
  filters: WorkQueueFilters,
  today: CivilDate,
  except?: QueueGroup,
): SQL {
  const groups = [...groupClauses(actor, filters, today)]
    .filter(([group]) => group !== except)
    .map(([, clause]) => clause)
  return and(...scopeClauses(actor, filters), ...groups) ?? sql`true`
}

const STATUS_ORDER = sql`array_position(array[${sql.join(
  CORE_STATES.map((state) => sql`${state}`),
  sql`, `,
)}]::text[], ${applications.state})`

const FIRST_REVIEWER = sql`(select min(${users.displayName}) from ${reviewAssignments}
  join ${users} on ${users.id} = ${reviewAssignments.reviewerUserId}
  where ${reviewAssignments.applicationId} = ${applications.id}
    and ${reviewAssignments.removedAt} is null)`

export const QUEUE_SORT_COLUMNS: Readonly<Record<QueueSortKey, SQLWrapper>> = {
  number: applications.number,
  status: STATUS_ORDER,
  due: NEXT_DUE,
  fees: FEES_DUE,
  reviewers: FIRST_REVIEWER,
}

export const QUEUE_TIEBREAK: readonly SQL[] = [
  sql`${NEXT_DUE} asc nulls last`,
  sql`${applications.receivedDate} asc nulls last`,
  sql`${applications.id} asc`,
]
