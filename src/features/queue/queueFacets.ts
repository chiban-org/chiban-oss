import { and, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import { typeFacetOptions } from '@/features/applications/typeFacets'
import type { Actor } from '@/features/auth/actor'
import { countFacets, facet } from '@/features/dataTable/facets'
import type { FilterOption } from '@/features/dataTable/quickFilters'
import {
  assignedClause,
  dueClause,
  flagClause,
  type QueueGroup,
  queueWhere,
  scopeClauses,
  tabClause,
} from '@/features/queue/queueFilterSql'
import { ASSIGNED_FILTERS, DUE_FILTERS, FLAG_FILTERS } from '@/features/queue/queueParams'
import { STATUS_TABS } from '@/features/queue/stateScopes'
import type { WorkQueueFilters } from '@/features/queue/workQueue'
import { townToday } from '@/features/town/today'

export interface QueueFacets {
  stages: ReadonlyMap<string, number>
  due: ReadonlyMap<string, number>
  assigned: ReadonlyMap<string, number>
  flags: ReadonlyMap<string, number>
  types: FilterOption[]
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
  const scope = and(...scopeClauses(actor, filters)) ?? sql`true`
  const counts = await countFacets(db, {
    table: applications,
    scope,
    others,
    facets: [
      facet('stage', STATUS_TABS, tabClause),
      facet('due', DUE_FILTERS, (v) => dueClause(v, today)),
      facet('assigned', ASSIGNED_FILTERS, (v) => assignedClause(v, actor)),
      facet('flags', FLAG_FILTERS, (v) => flagClause(v, actor)),
    ],
  })
  return {
    stages: counts.get('stage') ?? new Map(),
    due: counts.get('due') ?? new Map(),
    assigned: counts.get('assigned') ?? new Map(),
    flags: counts.get('flags') ?? new Map(),
    types: await typeFacetOptions(db, scope, others('types'), signal),
  }
}
