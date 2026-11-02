import { isNotNull } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { runImport } from '@/features/gis/import/runImport'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { gis12Of, SCENARIO_PARCELS } from '@/test/fixtureBuilders/abutterScenario'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'

const signal = new AbortController().signal
const DEFAULT_IMPORTED_AT = '2027-03-01T15:00:00Z'

export interface ScenarioOptions {
  roads?: 'centerline' | 'row' | 'none'
  water?: 'polygon' | 'centerline' | 'none'
  parcels?: boolean
  importedAt?: string
}

const ROAD_FILES = {
  centerline: 'abutters/roads-centerline.geojson',
  row: 'abutters/roads-row.geojson',
}
const WATER_FILES = {
  polygon: 'abutters/water-polygon.geojson',
  centerline: 'abutters/water-centerline.geojson',
}

async function importLayer(
  db: Db,
  actor: Actor,
  layerKey: 'parcels' | 'roads' | 'water',
  file: string,
  mapping: object,
): Promise<void> {
  await configureLayer(db, layerKey, mapping)
  const result = await runImport(
    db,
    { kind: 'user', userId: actor.userId },
    {
      layerKey,
      adapter: 'file_geojson',
      features: loadGeoJsonFixture(file),
      fullLayer: true,
    },
    signal,
  )
  if (!result.ok) throw new AppError(ErrorIds.DB_INVARIANT, `scenario import ${layerKey} failed`)
}

export async function importScenario(
  db: Db,
  actor: Actor,
  options: ScenarioOptions = {},
): Promise<Record<string, string>> {
  if (options.parcels !== false) {
    await importLayer(db, actor, 'parcels', 'abutters/parcels.geojson', PARCEL_MAPPING)
  }
  const roads = options.roads ?? 'centerline'
  if (roads !== 'none') {
    await importLayer(db, actor, 'roads', ROAD_FILES[roads], { sourceKey: 'ROAD_ID', name: 'NAME' })
  }
  const water = options.water ?? 'polygon'
  if (water !== 'none') {
    await importLayer(db, actor, 'water', WATER_FILES[water], {
      sourceKey: 'WATER_ID',
      name: 'NAME',
    })
  }
  await db
    .update(gisLayers)
    .set({ lastSuccessAt: new Date(options.importedAt ?? DEFAULT_IMPORTED_AT) })
    .where(isNotNull(gisLayers.lastSuccessAt))
  return await scenarioParcelIds(db)
}

export async function scenarioParcelIds(db: Db): Promise<Record<string, string>> {
  const ids: Record<string, string> = {}
  for (const parcel of SCENARIO_PARCELS) {
    const found = await resolveParcelId(db, { format: 'gis12', value: gis12Of(parcel) }, signal)
    if (found.ok) ids[parcel.name] = found.value.parcelId
  }
  return ids
}

export function namesOf(ids: Record<string, string>, parcelIds: string[]): string[] {
  const byId = new Map(Object.entries(ids).map(([name, id]) => [id, name]))
  return parcelIds.map((id) => byId.get(id) ?? id)
}
