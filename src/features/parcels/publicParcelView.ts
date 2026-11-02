import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { parcels } from '@/db/schema'
import { getLayerStatus, type LayerStatus } from '@/features/gis/layerStatus'
import { type HonestValue, honestFromLayer } from '@/features/honest/honest'
import { displayIdsFor } from '@/features/parcels/displayId'
import { getLineage, type LineageRef } from '@/features/parcels/lineage'
import { getParcelHistory, type ParcelHistory } from '@/features/parcels/parcelHistory'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { areaAcresOf, loadAliases } from '@/features/parcels/staffParcelView'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface PublicParcelView {
  parcelId: string
  status: 'active' | 'retired'
  retiredOn: CivilDate | null
  ids: { label: string; value: string; retired: boolean }[]
  siteAddress: HonestValue<string>
  owner: HonestValue<string>
  areaAcres: HonestValue<number>
  hasGeometry: boolean
  lineage: { parents: LineageRef[]; children: LineageRef[] }
  history: ParcelHistory
  layer: LayerStatus
}

export async function getPublicParcelView(
  db: Db,
  parcelId: string,
  now: Date,
  signal: AbortSignal,
): Promise<Result<PublicParcelView, 'not_found'>> {
  signal.throwIfAborted()
  const [parcel] = await db.select().from(parcels).where(eq(parcels.id, parcelId))
  if (parcel === undefined) return err('not_found')
  const layer = await getLayerStatus(db, 'parcels', now, signal)
  const aliases = await loadAliases(db, parcelId)
  const acres = parcel.geom === null ? null : await areaAcresOf(db, parcelId)
  return ok({
    parcelId,
    status: parcel.status,
    retiredOn: parcel.retiredOn as CivilDate | null,
    ids: aliases.map((a) => ({ label: a.label, value: a.value, retired: a.status === 'retired' })),
    siteAddress: honestFromLayer(layer, parcel.siteAddress),
    owner: honestFromLayer(layer, parcel.ownerName),
    areaAcres: honestFromLayer(layer, acres),
    hasGeometry: parcel.geom !== null,
    lineage: await getLineage(db, parcelId, signal),
    history: await getParcelHistory(db, parcelId, { kind: 'public' }, signal),
    layer,
  })
}

export type IdRoute =
  | { kind: 'redirect'; parcelId: string }
  | { kind: 'ambiguous'; choices: { parcelId: string; displayId: string | null }[] }
  | { kind: 'not_found' }

export async function resolveIdRoute(
  db: Db,
  format: string,
  value: string,
  signal: AbortSignal,
): Promise<IdRoute> {
  const found = await resolveParcelId(db, { format, value: decodeURIComponent(value) }, signal)
  if (found.ok) return { kind: 'redirect', parcelId: found.value.parcelId }
  if (found.error === 'not_found') return { kind: 'not_found' }
  const display = await displayIdsFor(db, found.error.ambiguous)
  return {
    kind: 'ambiguous',
    choices: found.error.ambiguous.map((parcelId) => ({
      parcelId,
      displayId: display.get(parcelId) ?? null,
    })),
  }
}
