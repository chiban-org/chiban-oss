import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { importExceptions, parcelAliases, parcelIdFormats, parcels } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { exceptionOnParcel } from '@/features/gis/exceptionParcel'
import { getLayerStatus, type LayerStatus } from '@/features/gis/layerStatus'
import { type HonestValue, honestFromLayer } from '@/features/honest/honest'
import { getLineage, type LineageRef } from '@/features/parcels/lineage'
import { getParcelHistory, type ParcelHistory } from '@/features/parcels/parcelHistory'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const SQUARE_METERS_PER_ACRE = 4046.8564224
const ACRE_DECIMALS = 2

export interface AliasView {
  format: string
  label: string
  value: string
  status: 'active' | 'retired'
  source: 'import' | 'manual' | 'override'
  retiredOn: CivilDate | null
}

export interface StaffParcelView {
  parcelId: string
  status: 'active' | 'retired'
  retiredOn: CivilDate | null
  aliases: AliasView[]
  geometry: HonestValue<GeoJSON.MultiPolygon>
  siteAddress: HonestValue<string>
  owner: HonestValue<string>
  mailingAddress: HonestValue<string>
  areaAcres: HonestValue<number>
  lineage: { parents: LineageRef[]; children: LineageRef[] }
  history: ParcelHistory
  openExceptions: number
  layer: LayerStatus
}

export async function loadAliases(db: Db, parcelId: string): Promise<AliasView[]> {
  const rows = await db
    .select({
      format: parcelAliases.format,
      label: parcelIdFormats.label,
      value: parcelAliases.value,
      status: parcelAliases.status,
      source: parcelAliases.source,
      retiredOn: parcelAliases.retiredOn,
      isDisplay: parcelIdFormats.isDisplay,
    })
    .from(parcelAliases)
    .innerJoin(parcelIdFormats, eq(parcelIdFormats.key, parcelAliases.format))
    .where(eq(parcelAliases.parcelId, parcelId))
  return rows
    .sort(
      (a, b) =>
        Number(b.isDisplay) - Number(a.isDisplay) ||
        a.status.localeCompare(b.status) ||
        a.value.localeCompare(b.value),
    )
    .map(({ isDisplay: _display, ...row }) => ({
      ...row,
      retiredOn: row.retiredOn as CivilDate | null,
    }))
}

export async function areaAcresOf(db: Db, parcelId: string): Promise<number | null> {
  const res = await db.execute<{ acres: number | null }>(
    sql`SELECT round((ST_Area(geom::geography) / ${SQUARE_METERS_PER_ACRE})::numeric, ${ACRE_DECIMALS})::float8 AS acres
        FROM parcels WHERE id = ${parcelId}::uuid`,
  )
  return res.rows[0]?.acres ?? null
}

async function countOpenExceptions(db: Db, parcelId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(importExceptions)
    .where(and(eq(importExceptions.status, 'open'), exceptionOnParcel(parcelId)))
  return rows[0]?.n ?? 0
}

export async function getStaffParcelView(
  db: Db,
  actor: Actor,
  parcelId: string,
  now: Date,
  signal: AbortSignal,
): Promise<Result<StaffParcelView, 'not_found' | 'forbidden'>> {
  signal.throwIfAborted()
  if (actor.kind !== 'staff') return err('forbidden')
  const [parcel] = await db.select().from(parcels).where(eq(parcels.id, parcelId))
  if (parcel === undefined) return err('not_found')
  const layer = await getLayerStatus(db, 'parcels', now, signal)
  const aliases = await loadAliases(db, parcelId)
  const acres = parcel.geom === null ? null : await areaAcresOf(db, parcelId)
  return ok({
    parcelId,
    status: parcel.status,
    retiredOn: parcel.retiredOn as CivilDate | null,
    aliases,
    geometry: honestFromLayer(layer, parcel.geom as GeoJSON.MultiPolygon | null),
    siteAddress: honestFromLayer(layer, parcel.siteAddress),
    owner: honestFromLayer(layer, parcel.ownerName),
    mailingAddress: honestFromLayer(layer, parcel.mailingAddress),
    areaAcres: honestFromLayer(layer, acres),
    lineage: await getLineage(db, parcelId, signal),
    history: await getParcelHistory(db, parcelId, { kind: 'actor', actor }, signal),
    openExceptions: await countOpenExceptions(db, parcelId),
    layer,
  })
}
