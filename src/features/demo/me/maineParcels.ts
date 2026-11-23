import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { must } from '@/features/demo/seedPermitSupport'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import { runImport } from '@/features/gis/import/runImport'
import type { SourceFeature } from '@/features/gis/import/types'
import { syncPackParcelIdFormats } from '@/features/parcels/syncPackFormats'

const PARCEL_MAPPING = {
  primaryId: { field: 'MAP_LOT', format: 'map_lot', padNumeric: false },
  extraIds: [],
  siteAddress: { fields: ['SITE_ADDR'] },
  ownerName: 'OWNER',
  mailingAddress: { fields: ['MAIL_ADDR'] },
}

const LAYERS: { key: LayerKey; file: string; mapping: object }[] = [
  {
    key: 'parcels',
    file: 'fernhollow-parcels.geojson',
    mapping: PARCEL_MAPPING,
  },
  {
    key: 'roads',
    file: 'fernhollow-roads.geojson',
    mapping: { sourceKey: 'ROAD_ID', name: 'NAME' },
  },
  {
    key: 'water',
    file: 'fernhollow-water.geojson',
    mapping: { sourceKey: 'WATER_ID', name: 'NAME' },
  },
]

function readFeatures(file: string): SourceFeature[] {
  const url = new URL(`../fixtures/me/${file}`, import.meta.url)
  const raw = readFileSync(fileURLToPath(url), 'utf8')
  return (JSON.parse(raw) as GeoJSON.FeatureCollection).features.map((f, i) => ({
    rowRef: String(i),
    properties: f.properties ?? {},
    geometry: f.geometry,
  }))
}

export async function seedMaineParcels(db: Db, importer: Actor, signal: AbortSignal) {
  signal.throwIfAborted()
  await syncPackParcelIdFormats(db, signal)
  for (const layer of LAYERS) {
    await db.update(gisLayers).set({ mapping: layer.mapping }).where(eq(gisLayers.key, layer.key))
    const result = await runImport(
      db,
      { kind: 'user', userId: importer.userId },
      {
        layerKey: layer.key,
        adapter: 'file_geojson',
        features: readFeatures(layer.file),
        fullLayer: true,
      },
      signal,
    )
    must(result, `import ${layer.key}`)
  }
}
