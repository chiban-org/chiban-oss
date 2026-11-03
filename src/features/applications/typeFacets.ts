import { asc, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import { getPublished } from '@/features/config/store'
import type { FilterOption } from '@/features/dataTable/quickFilters'

export async function typeLabel(db: DbOrTx, key: string, signal: AbortSignal): Promise<string> {
  const published = await getPublished(db, 'application_type', key, signal)
  const body = published?.body as ApplicationTypeBody | undefined
  return body?.label ?? key
}

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
  const options: FilterOption[] = []
  for (const row of rows) {
    options.push({ value: row.key, label: await typeLabel(db, row.key, signal), count: row.count })
  }
  return options
}

export async function typeLabels(
  db: DbOrTx,
  keys: readonly string[],
  signal: AbortSignal,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  for (const key of keys) labels.set(key, await typeLabel(db, key, signal))
  return labels
}
