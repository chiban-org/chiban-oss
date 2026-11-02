import { and, eq, sql } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { parcelAliases, parcels } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { ImportExceptionKind } from '@/features/gis/exceptionKinds'
import { checkGeometry, unionToMultiPolygon } from '@/features/gis/geometryValidity'
import type { ImportContext } from '@/features/gis/import/context'
import { recordException } from '@/features/gis/import/exceptions'
import type { IdValue, PreparedRow } from '@/features/gis/import/prepareRows'
import type { RowOutcome } from '@/features/gis/import/types'
import { addAlias } from '@/features/parcels/aliases'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'

export interface RowResult {
  outcome: RowOutcome
  kind?: ImportExceptionKind
}

type Geometry = GeoJSON.MultiPolygon

function except(
  ctx: ImportContext,
  row: PreparedRow,
  kind: ImportExceptionKind,
  detail: string,
  extra: object = {},
): Promise<RowResult> {
  return recordException(ctx.tx, {
    layerKey: ctx.layerKey,
    runId: ctx.runId,
    rowKey: row.rowKey,
    kind,
    detail,
    payload: { rowRefs: row.rowRefs, properties: row.properties, ...extra },
  }).then(() => ({ outcome: 'excepted', kind }))
}

async function validatedGeometry(
  ctx: ImportContext,
  row: PreparedRow,
): Promise<
  { ok: true; geometry: Geometry } | { ok: false; kind: ImportExceptionKind; detail: string }
> {
  if (row.geometries.length === 0) {
    return { ok: false, kind: 'missing_geometry', detail: 'Feature has no geometry' }
  }
  const valid: Geometry[] = []
  for (const part of row.geometries) {
    const checked = await checkGeometry(ctx.tx, part, ctx.signal)
    if (!checked.ok) return { ok: false, kind: 'invalid_geometry', detail: checked.error.reason }
    valid.push(checked.value)
  }
  const [only] = valid
  if (valid.length === 1 && only !== undefined) return { ok: true, geometry: only }
  return { ok: true, geometry: await unionToMultiPolygon(ctx.tx, valid, ctx.signal) }
}

async function activeAlias(ctx: ImportContext, id: IdValue) {
  const [alias] = await ctx.tx
    .select({ parcelId: parcelAliases.parcelId, source: parcelAliases.source })
    .from(parcelAliases)
    .where(
      and(
        eq(parcelAliases.format, id.format),
        eq(parcelAliases.value, id.value),
        eq(parcelAliases.status, 'active'),
      ),
    )
  return alias
}

async function aliasConflict(
  ctx: ImportContext,
  row: PreparedRow,
  parcelId: string | null,
): Promise<{ kind: ImportExceptionKind; detail: string } | null> {
  const ids = row.primary === null ? row.extras : [row.primary, ...row.extras]
  for (const id of ids) {
    const alias = await activeAlias(ctx, id)
    if (alias === undefined) continue
    const isPrimary = id === row.primary
    const overridden = alias.source === 'override'
    if (overridden && (isPrimary || alias.parcelId !== parcelId)) {
      return {
        kind: 'alias_conflicts_override',
        detail: `${id.format} ${id.value} is set by an override`,
      }
    }
    if (alias.parcelId !== parcelId) {
      return {
        kind: 'alias_conflict',
        detail: `${id.format} ${id.value} belongs to another parcel`,
      }
    }
  }
  return null
}

async function createParcel(
  ctx: ImportContext,
  row: PreparedRow,
  geometry: Geometry,
): Promise<RowResult> {
  const [created] = await ctx.tx
    .insert(parcels)
    .values({
      geom: geometry,
      siteAddress: row.siteAddress,
      ownerName: row.ownerName,
      mailingAddress: row.mailingAddress,
    })
    .returning({ id: parcels.id })
  const parcelId = created?.id ?? ''
  const ids = row.primary === null ? [] : [row.primary, ...row.extras]
  for (const id of ids) {
    const added = await addAlias(
      ctx.tx,
      { parcelId, ...id, source: 'import' },
      ctx.actor,
      ctx.signal,
    )
    if (!added.ok)
      throw new AppError(ErrorIds.DB_INVARIANT, 'Alias taken after conflict check', { ...id })
  }
  await writeAudit(
    ctx.tx,
    {
      actor: ctx.actor,
      action: 'parcel.create',
      entityType: 'parcel',
      entityId: parcelId,
      after: { siteAddress: row.siteAddress, ownerName: row.ownerName, geometry, ids },
    },
    ctx.signal,
  )
  return { outcome: 'created' }
}

async function updateParcel(
  ctx: ImportContext,
  row: PreparedRow,
  parcelId: string,
  geometry: Geometry,
): Promise<RowResult> {
  const res = await ctx.tx.execute<{ same: boolean; geom_json: string | null }>(sql`
    SELECT COALESCE(ST_Equals(geom, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)), false) AS same,
           ST_AsGeoJSON(geom, 15) AS geom_json
    FROM parcels WHERE id = ${parcelId}::uuid FOR UPDATE`)
  const sameGeometry = res.rows[0]?.same === true
  const [stored] = await ctx.tx.select().from(parcels).where(eq(parcels.id, parcelId))
  if (stored === undefined)
    throw new AppError(ErrorIds.DB_INVARIANT, 'Resolved parcel vanished', { parcelId })
  const ownerHeld = stored.ownerName !== null && row.ownerName !== stored.ownerName
  const mailingHeld = stored.mailingAddress !== null && row.mailingAddress !== stored.mailingAddress
  if (ownerHeld || mailingHeld) {
    return await except(
      ctx,
      row,
      'owner_changed',
      'Owner or mailing address differs from the stored value',
      {
        parcelId,
        current: { ownerName: stored.ownerName, mailingAddress: stored.mailingAddress },
        proposed: {
          siteAddress: row.siteAddress,
          ownerName: row.ownerName,
          mailingAddress: row.mailingAddress,
          geometry,
        },
      },
    )
  }
  const existingIds = await ctx.tx
    .select({ format: parcelAliases.format, value: parcelAliases.value })
    .from(parcelAliases)
    .where(and(eq(parcelAliases.parcelId, parcelId), eq(parcelAliases.status, 'active')))
  const missing = row.extras.filter(
    (e) => !existingIds.some((x) => x.format === e.format && x.value === e.value),
  )
  const patch: Partial<typeof parcels.$inferInsert> = {}
  if (!sameGeometry) patch.geom = geometry
  if (row.siteAddress !== null && row.siteAddress !== stored.siteAddress)
    patch.siteAddress = row.siteAddress
  if (stored.ownerName === null && row.ownerName !== null) patch.ownerName = row.ownerName
  if (stored.mailingAddress === null && row.mailingAddress !== null)
    patch.mailingAddress = row.mailingAddress
  if (Object.keys(patch).length === 0 && missing.length === 0) return { outcome: 'unchanged' }
  await ctx.tx
    .update(parcels)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(parcels.id, parcelId))
  for (const id of missing) {
    const added = await addAlias(
      ctx.tx,
      { parcelId, ...id, source: 'import' },
      ctx.actor,
      ctx.signal,
    )
    if (!added.ok)
      throw new AppError(ErrorIds.DB_INVARIANT, 'Alias taken after conflict check', { ...id })
  }
  await writeAudit(
    ctx.tx,
    {
      actor: ctx.actor,
      action: 'parcel.import_update',
      entityType: 'parcel',
      entityId: parcelId,
      before: {
        siteAddress: stored.siteAddress,
        ownerName: stored.ownerName,
        mailingAddress: stored.mailingAddress,
        geometry:
          res.rows[0]?.geom_json === null ? null : JSON.parse(res.rows[0]?.geom_json ?? 'null'),
      },
      after: { ...patch, addedIds: missing },
    },
    ctx.signal,
  )
  return { outcome: 'applied' }
}

export async function applyParcelRow(ctx: ImportContext, row: PreparedRow): Promise<RowResult> {
  ctx.signal.throwIfAborted()
  if (row.failure !== null) return await except(ctx, row, row.failure.kind, row.failure.detail)
  const geometry = await validatedGeometry(ctx, row)
  if (!geometry.ok) {
    return await except(ctx, row, geometry.kind, geometry.detail, { geometry: row.geometries })
  }
  const primary = row.primary
  if (primary === null) return await except(ctx, row, 'missing_required_field', 'No primary id')
  const resolved = await resolveParcelId(ctx.tx, primary, ctx.signal)
  if (!resolved.ok && resolved.error !== 'not_found') {
    return await except(
      ctx,
      row,
      'id_resolves_to_retired',
      `${primary.value} belongs to a retired parcel`,
    )
  }
  if (resolved.ok && resolved.value.via === 'retired') {
    return await except(
      ctx,
      row,
      'id_resolves_to_retired',
      `${primary.value} belongs to a retired parcel`,
    )
  }
  const parcelId = resolved.ok ? resolved.value.parcelId : null
  const conflict = await aliasConflict(ctx, row, parcelId)
  if (conflict !== null) return await except(ctx, row, conflict.kind, conflict.detail)
  return parcelId === null
    ? await createParcel(ctx, row, geometry.geometry)
    : await updateParcel(ctx, row, parcelId, geometry.geometry)
}
