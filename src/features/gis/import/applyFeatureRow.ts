import { and, eq, sql } from 'drizzle-orm'
import { gisFeatures } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { checkAnyGeometry } from '@/features/gis/geometryValidity'
import type { RowResult } from '@/features/gis/import/applyParcelRow'
import type { ImportContext } from '@/features/gis/import/context'
import { recordException } from '@/features/gis/import/exceptions'
import type { SourceFeature } from '@/features/gis/import/types'
import type { FeatureMapping } from '@/features/gis/layerMapping'

export interface FeatureRow {
  rowKey: string
  sourceKey: string
  name: string | null
  feature: SourceFeature
}

export function prepareFeatureRows(
  features: SourceFeature[],
  mapping: FeatureMapping,
): FeatureRow[] {
  return features.map((feature) => {
    const raw = mapping.sourceKey === undefined ? null : feature.properties[mapping.sourceKey]
    const sourceKey =
      raw === null || raw === undefined || String(raw).trim() === ''
        ? feature.rowRef
        : String(raw).trim()
    const nameRaw = mapping.name === undefined ? null : feature.properties[mapping.name]
    const name =
      nameRaw === null || nameRaw === undefined || String(nameRaw).trim() === ''
        ? null
        : String(nameRaw).trim()
    return { rowKey: `src:${sourceKey}`, sourceKey, name, feature }
  })
}

function except(
  ctx: ImportContext,
  row: FeatureRow,
  kind: 'missing_geometry' | 'invalid_geometry',
  detail: string,
): Promise<RowResult> {
  return recordException(ctx.tx, {
    layerKey: ctx.layerKey,
    runId: ctx.runId,
    rowKey: row.rowKey,
    kind,
    detail,
    payload: {
      rowRefs: [row.feature.rowRef],
      properties: row.feature.properties,
      geometry: row.feature.geometry,
    },
  }).then(() => ({ outcome: 'excepted', kind }))
}

export async function applyFeatureRow(ctx: ImportContext, row: FeatureRow): Promise<RowResult> {
  ctx.signal.throwIfAborted()
  const geometry = row.feature.geometry
  if (geometry === null)
    return await except(ctx, row, 'missing_geometry', 'Feature has no geometry')
  const checked = await checkAnyGeometry(ctx.tx, geometry, ctx.signal)
  if (!checked.ok) return await except(ctx, row, 'invalid_geometry', checked.error.reason)
  const [stored] = await ctx.tx
    .select({ id: gisFeatures.id, name: gisFeatures.name })
    .from(gisFeatures)
    .where(and(eq(gisFeatures.layerKey, ctx.layerKey), eq(gisFeatures.sourceKey, row.sourceKey)))
    .for('update')
  if (stored === undefined) {
    await ctx.tx
      .insert(gisFeatures)
      .values({ layerKey: ctx.layerKey, sourceKey: row.sourceKey, name: row.name, geom: geometry })
    return { outcome: 'created' }
  }
  const same = await ctx.tx.execute<{ same: boolean }>(sql`
    SELECT COALESCE(ST_Equals(geom, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)), false) AS same
    FROM gis_features WHERE id = ${stored.id}::uuid`)
  if (same.rows[0]?.same === true && stored.name === row.name) return { outcome: 'unchanged' }
  await ctx.tx
    .update(gisFeatures)
    .set({ name: row.name, geom: geometry })
    .where(eq(gisFeatures.id, stored.id))
  await writeAudit(
    ctx.tx,
    {
      actor: ctx.actor,
      action: 'gis_feature.import_update',
      entityType: 'gis_feature',
      entityId: stored.id,
      before: { name: stored.name },
      after: { name: row.name },
    },
    ctx.signal,
  )
  return { outcome: 'applied' }
}
