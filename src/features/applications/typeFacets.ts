import { asc, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import type { FilterOption } from '@/features/dataTable/quickFilters'
import { applicationTypeLabels } from '@/features/reports/typeLabels'

export async function typeFacetOptions(
  db: DbOrTx,
  scope: SQL,
  counted: SQL,
  signal: AbortSignal,
): Promise<FilterOption[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({
      key: applications.applicationTypeKey,
      count: sql<number>`(count(*) filter (where ${counted}))::int`,
    })
    .from(applications)
    .where(scope)
    .groupBy(applications.applicationTypeKey)
    .orderBy(asc(applications.applicationTypeKey))
  const labels = await applicationTypeLabels(
    db,
    rows.map((row) => row.key),
    signal,
  )
  return rows.map((row) => ({
    value: row.key,
    label: labels.get(row.key) ?? row.key,
    count: row.count,
  }))
}
