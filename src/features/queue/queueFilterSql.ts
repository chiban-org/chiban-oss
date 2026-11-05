import { inArray, type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import { applications, projects, reviewAssignments, users } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import { CORE_STATES } from '@/features/applications/states'
import type { Actor } from '@/features/auth/actor'
import { anyOf, whereAll } from '@/features/dataTable/facets'
import type {
  AssignedFilter,
  DueFilter,
  FlagFilter,
  QueueSortKey,
} from '@/features/queue/queueParams'
import {
  DEADLINE_OPEN,
  EARLIEST_DUE,
  FEES_DUE,
  preservationIncompleteFor,
  UNKNOWN_PAYMENT,
} from '@/features/queue/queueSql'
import { NEEDS_ACTION_STATES, type StatusTab, statesForTab } from '@/features/queue/stateScopes'
import type { WorkQueueFilters } from '@/features/queue/workQueue'
import { addDays, type CivilDate } from '@/types/civilDate'

export const DUE_WEEK_DAYS = 7

const NEEDS_ACTION = sql`(${inArray(applications.state, [...NEEDS_ACTION_STATES])}
  or (${applications.state} <> 'draft' and ${DEADLINE_OPEN}))`

const ACTIVE_ASSIGNMENT = sql`select 1 from review_assignments ra
  where ra.application_id = ${applications.id} and ra.removed_at is null`

const REVIEWS_BACK = sql`(${applications.state} = 'under_review'
  and exists (${ACTIVE_ASSIGNMENT})
  and not exists (${ACTIVE_ASSIGNMENT} and ra.status = 'pending'))`

export function dueClause(value: DueFilter, today: CivilDate): SQL {
  switch (value) {
    case 'overdue':
      return sql`${EARLIEST_DUE} < ${today}::date`
    case 'week':
      return sql`(${EARLIEST_DUE} >= ${today}::date and ${EARLIEST_DUE} <= ${addDays(today, DUE_WEEK_DAYS)}::date)`
    case 'none':
      return sql`${EARLIEST_DUE} is null`
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
    case 'reviewed':
      return REVIEWS_BACK
  }
}

function statesClause(states: readonly string[] | undefined): SQL {
  return states === undefined ? NEEDS_ACTION : inArray(applications.state, [...states])
}

export function tabClause(tab: StatusTab): SQL {
  return statesClause(statesForTab(tab))
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function scopeClauses(actor: Actor, filters: WorkQueueFilters): (SQL | undefined)[] {
  const search = filters.numberContains ?? ''
  return [
    applicationVisibleTo(actor),
    search === '' ? undefined : sql`${applications.number} ilike ${`%${escapeLike(search)}%`}`,
  ]
}

export type QueueGroup = 'stage' | 'state' | 'due' | 'assigned' | 'types' | 'flags'

export function groupClauses(
  actor: Actor,
  filters: WorkQueueFilters,
  today: CivilDate,
): ReadonlyMap<QueueGroup, SQL | undefined> {
  const types = filters.typeKeys ?? []
  const stateKeys = filters.stateKeys ?? []
  return new Map<QueueGroup, SQL | undefined>([
    ['stage', statesClause(filters.states)],
    ['state', stateKeys.length === 0 ? undefined : inArray(applications.state, stateKeys)],
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
  return whereAll(scopeClauses(actor, filters), groupClauses(actor, filters, today), except)
}

export const STATUS_ORDER = sql`array_position(array[${sql.join(
  CORE_STATES.map((state) => sql`${state}`),
  sql`, `,
)}]::text[], ${applications.state})`

const FIRST_REVIEWER = sql`(select min(${users.displayName}) from ${reviewAssignments}
  join ${users} on ${users.id} = ${reviewAssignments.reviewerUserId}
  where ${reviewAssignments.applicationId} = ${applications.id}
    and ${reviewAssignments.removedAt} is null)`

const PARCEL_DISPLAY_ID = sql`(
  select a.value from parcel_aliases a
  join parcel_id_formats f on f.key = a.format and f.is_display
  join projects pr on pr.parcel_id = a.parcel_id
  where pr.id = ${applications.projectId}
  order by (a.status = 'active') desc, a.value limit 1)`

export const QUEUE_SORT_COLUMNS: Readonly<Record<QueueSortKey, SQLWrapper>> = {
  number: applications.number,
  project: projects.title,
  parcel: PARCEL_DISPLAY_ID,
  status: STATUS_ORDER,
  due: EARLIEST_DUE,
  fees: FEES_DUE,
  reviewers: FIRST_REVIEWER,
  received: applications.receivedDate,
}

export const QUEUE_TIEBREAK: readonly SQL[] = [
  sql`${EARLIEST_DUE} asc nulls last`,
  sql`${applications.receivedDate} asc nulls last`,
  sql`${applications.id} asc`,
]
