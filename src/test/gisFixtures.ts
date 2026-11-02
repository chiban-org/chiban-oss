import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import type { SourceFeature } from '@/features/gis/import/types'

const FIXTURE_DIR = path.resolve(import.meta.dirname, 'fixtures/gis')

export const PARCEL_MAPPING = {
  primaryId: { field: 'MAPLOT', format: 'gis12', padNumeric: false },
  extraIds: [
    { field: 'CAMA', format: 'cama15', padNumeric: false },
    { field: 'CAMA_2', format: 'cama15', padNumeric: false },
    { field: 'CAMA_3', format: 'cama15', padNumeric: false },
  ],
  siteAddress: { fields: ['SITE_ADDR'] },
  ownerName: 'OWNER',
  mailingAddress: { fields: ['MAIL_ADDR'] },
} as const

export function loadGeoJsonFixture(name: string): SourceFeature[] {
  const raw = readFileSync(path.join(FIXTURE_DIR, name), 'utf8')
  const collection = JSON.parse(raw) as GeoJSON.FeatureCollection
  return collection.features.map((f, i) => ({
    rowRef: String(i),
    properties: f.properties ?? {},
    geometry: f.geometry,
  }))
}

export async function configureLayer(
  db: Db,
  key: LayerKey,
  mapping: object,
  patch: Partial<typeof gisLayers.$inferInsert> = {},
): Promise<void> {
  await db
    .update(gisLayers)
    .set({ mapping, ...patch })
    .where(eq(gisLayers.key, key))
}
