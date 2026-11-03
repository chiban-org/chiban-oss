import { eq, inArray, type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, parcelAliases, parcelIdFormats, projects } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import {
  APPLICATION_SORT,
  type ApplicationSortKey,
  STATE_GROUP_STATES,
  STATE_GROUPS,
  type StaffListFilters,
  type StateGroup,
} from '@/features/applications/staffListParams'
import { typeFacetOptions } from '@/features/applications/typeFacets'
import type { Actor } from '@/features/auth/actor'
import { anyOf, countFacets, facet, whereAll } from '@/features/dataTable/facets'
import type { FilterOption } from '@/features/dataTable/quickFilters'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { assignedClause, dueClause, STATUS_ORDER } from '@/features/queue/queueFilterSql'
import { ASSIGNED_FILTERS, DUE_FILTERS } from '@/features/queue/queueParams'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'

export interface StaffApplicationRow {
  id: string
  number: string
  state: string
  substep: string | null
  projectTitle: string
  parcelId: string
  receivedDate: string | null
}

export interface StaffApplicationPage {
  rows: StaffApplicationRow[]
  total: number
  offset: number
  prevOffset: number | null
  nextOffset: number | null
}

type ListGroup = 'types' | 'stateGroups' | 'due' | 'assigned'

const PARCEL_DISPLAY = sql`(select ${parcelAliases.value} from ${parcelAliases}
  join ${parcelIdFormats} on ${parcelIdFormats.key} = ${parcelAliases.format}
  where ${parcelAliases.parcelId} = ${projects.parcelId} and ${parcelIdFormats.isDisplay}
  order by ${parcelAliases.status} asc, ${parcelAliases.value} asc limit 1)`

const SORT_COLUMNS: Readonly<Record<ApplicationSortKey, SQLWrapper>> = {
  newest: applications.seq,
  number: applications.number,
  project: projects.title,
  parcel: PARCEL_DISPLAY,
  state: STATUS_ORDER,
  received: applications.receivedDate,
}

const TIEBREAK: readonly SQL[] = [sql`${applications.seq} desc`]

function stateGroupClause(group: StateGroup): SQL {
  return inArray(applications.state, [...(STATE_GROUP_STATES.get(group) ?? [])])
}

function groupClauses(actor: Actor, filters: StaffListFilters, today: CivilDate) {
  const types = filters.typeKeys ?? []
  return new Map<ListGroup, SQL | undefined>([
    ['types', types.length === 0 ? undefined : inArray(applications.applicationTypeKey, types)],
    ['stateGroups', anyOf((filters.stateGroups ?? []).map(stateGroupClause))],
    ['due', anyOf((filters.due ?? []).map((v) => dueClause(v, today)))],
    ['assigned', anyOf((filters.assigned ?? []).map((v) => assignedClause(v, actor)))],
  ])
}

function listWhere(actor: Actor, filters: StaffListFilters, today: CivilDate, except?: ListGroup) {
  return whereAll([applicationVisibleTo(actor)], groupClauses(actor, filters, today), except)
}

export async function listStaffApplications(
  db: DbOrTx,
  actor: Actor,
  input: {
    filters: StaffListFilters
    sort?: SortState<ApplicationSortKey>
    limit: number
    offset: number
    now?: Date
  },
  signal: AbortSignal,
): Promise<StaffApplicationPage> {
  const today = await townToday(db, input.now ?? new Date(), signal)
  const where = listWhere(actor, input.filters, today)
  const sort = input.sort ?? defaultSort(APPLICATION_SORT)
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(applications).where(where)
  const rows = await db
    .select({
      id: applications.id,
      number: applications.number,
      state: applications.state,
      substep: applications.substep,
      projectTitle: projects.title,
      parcelId: projects.parcelId,
      receivedDate: applications.receivedDate,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(where)
    .orderBy(...orderBySql(sort, SORT_COLUMNS, TIEBREAK))
    .limit(input.limit + 1)
    .offset(input.offset)
  return {
    rows: rows.slice(0, input.limit),
    total: count?.n ?? 0,
    offset: input.offset,
    prevOffset: input.offset === 0 ? null : Math.max(0, input.offset - input.limit),
    nextOffset: rows.length > input.limit ? input.offset + input.limit : null,
  }
}

export interface StaffApplicationFacets {
  stateGroups: ReadonlyMap<string, number>
  due: ReadonlyMap<string, number>
  assigned: ReadonlyMap<string, number>
  types: FilterOption[]
}

export async function staffApplicationFacets(
  db: DbOrTx,
  actor: Actor,
  input: { filters: StaffListFilters; now?: Date },
  signal: AbortSignal,
): Promise<StaffApplicationFacets> {
  const today = await townToday(db, input.now ?? new Date(), signal)
  const others = (group: ListGroup) => listWhere(actor, input.filters, today, group)
  const scope = applicationVisibleTo(actor)
  const counts = await countFacets(db, {
    table: applications,
    scope,
    others,
    facets: [
      facet('stateGroups', STATE_GROUPS, stateGroupClause),
      facet('due', DUE_FILTERS, (v) => dueClause(v, today)),
      facet('assigned', ASSIGNED_FILTERS, (v) => assignedClause(v, actor)),
    ],
  })
  return {
    stateGroups: counts.get('stateGroups') ?? new Map(),
    due: counts.get('due') ?? new Map(),
    assigned: counts.get('assigned') ?? new Map(),
    types: await typeFacetOptions(db, scope, others('types'), signal),
  }
}
