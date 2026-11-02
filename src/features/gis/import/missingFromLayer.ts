import { and, eq } from 'drizzle-orm'
import { parcelAliases, parcels } from '@/db/schema'
import type { ImportContext } from '@/features/gis/import/context'
import { recordException } from '@/features/gis/import/exceptions'

export async function reportMissingFromLayer(
  ctx: ImportContext,
  primaryFormat: string,
  seenPrimaryValues: Set<string>,
): Promise<number> {
  const active = await ctx.tx
    .select({ parcelId: parcels.id, value: parcelAliases.value })
    .from(parcels)
    .innerJoin(parcelAliases, eq(parcelAliases.parcelId, parcels.id))
    .where(
      and(
        eq(parcels.status, 'active'),
        eq(parcelAliases.format, primaryFormat),
        eq(parcelAliases.status, 'active'),
      ),
    )
  let count = 0
  for (const row of active) {
    if (seenPrimaryValues.has(row.value)) continue
    await recordException(ctx.tx, {
      layerKey: ctx.layerKey,
      runId: ctx.runId,
      rowKey: `id:${row.value}`,
      kind: 'missing_from_layer',
      detail: `${row.value} is not in the latest full layer`,
      payload: { parcelId: row.parcelId, value: row.value },
    })
    count += 1
  }
  return count
}
