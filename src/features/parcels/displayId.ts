import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { parcelAliases, parcelIdFormats } from '@/db/schema'

export async function displayIdsFor(db: DbOrTx, parcelIds: string[]): Promise<Map<string, string>> {
  if (parcelIds.length === 0) return new Map()
  const rows = await db
    .select({
      parcelId: parcelAliases.parcelId,
      value: parcelAliases.value,
      status: parcelAliases.status,
    })
    .from(parcelAliases)
    .innerJoin(parcelIdFormats, eq(parcelIdFormats.key, parcelAliases.format))
    .where(sql`${parcelIdFormats.isDisplay} AND ${inArray(parcelAliases.parcelId, parcelIds)}`)
    .orderBy(asc(parcelAliases.status), asc(parcelAliases.value))
  const result = new Map<string, string>()
  for (const row of rows) {
    if (!result.has(row.parcelId)) result.set(row.parcelId, row.value)
  }
  return result
}
