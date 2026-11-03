import { and, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import { typeFacetOptions } from '@/features/applications/typeFacets'
import type { Actor } from '@/features/auth/actor'
import type { FilterOption } from '@/features/dataTable/quickFilters'
import {
  assignedClause,
  dueClause,
  flagClause,
  type QueueGroup,
  queueWhere,
  scopeClauses,
} from '@/features/queue/queueFilterSql'
import {
  ASSIGNED_FILTERS,
  type AssignedFilter,
  DUE_FILTERS,
  type DueFilter,
  FLAG_FILTERS,
  type FlagFilter,
} from '@/features/queue/queueParams'
import type { WorkQueueFilters } from '@/features/queue/workQueue'
import { townToday } from '@/features/town/today'

export interface QueueFacets {
  due: ReadonlyMap<DueFilter, number>
  assigned: ReadonlyMap<AssignedFilter, number>
  flags: ReadonlyMap<FlagFilter, number>
  types: FilterOption[]
}

interface Counted<V extends string> {
  group: QueueGroup
  values: readonly V[]
  clause: (value: V) => SQL
}

function countColumns<V extends string>(
  spec: Counted<V>,
  others: (group: QueueGroup) => SQL,
): [string, SQL<number>][] {
  return spec.values.map((value) => [
    `${spec.group}:${value}`,
    sql<number>`(count(*) filter (where ${spec.clause(value)} and ${others(spec.group)}))::int`,
  ])
}

function pick<V extends string>(
  counts: Record<string, number>,
  group: QueueGroup,
  values: readonly V[],
): Map<V, number> {
  const byName = new Map(Object.entries(counts))
  return new Map(values.map((value) => [value, byName.get(`${group}:${value}`) ?? 0]))
}

export async function queueFacets(
  db: DbOrTx,
  actor: Actor,
  input: { filters: WorkQueueFilters; now?: Date },
  signal: AbortSignal,
): Promise<QueueFacets> {
  const { filters } = input
  const today = await townToday(db, input.now ?? new Date(), signal)
  const others = (group: QueueGroup) => queueWhere(actor, filters, today, group)
  const columns = Object.fromEntries([
    ...countColumns(
      { group: 'due', values: DUE_FILTERS, clause: (v) => dueClause(v, today) },
      others,
    ),
    ...countColumns(
      { group: 'assigned', values: ASSIGNED_FILTERS, clause: (v) => assignedClause(v, actor) },
      others,
    ),
    ...countColumns(
      { group: 'flags', values: FLAG_FILTERS, clause: (v) => flagClause(v, actor) },
      others,
    ),
  ])
  const scope = and(...scopeClauses(actor, filters)) ?? sql`true`
  const [counts] = await db.select(columns).from(applications).where(scope)
  const found = (counts ?? {}) as Record<string, number>
  return {
    due: pick(found, 'due', DUE_FILTERS),
    assigned: pick(found, 'assigned', ASSIGNED_FILTERS),
    flags: pick(found, 'flags', FLAG_FILTERS),
    types: await typeFacetOptions(db, scope, others('types'), signal),
  }
}
