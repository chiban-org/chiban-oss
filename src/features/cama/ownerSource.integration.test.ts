import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, gisLayers } from '@/db/schema'
import { DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { saveCamaMapping } from '@/features/cama/saveMapping'
import { updateLayerSettings } from '@/features/gis/layerSettings'
import { PARCEL_MAPPING } from '@/test/gisFixtures'
import { staffActor } from '@/test/parcels'
import {
  type CamaWorld,
  PARCEL_MAPPING_WITHOUT_OWNER,
  setupCamaWorld,
} from '@/test/testHarness/cama'

const signal = new AbortController().signal
let world: CamaWorld

beforeEach(async () => {
  world = await setupCamaWorld()
  await world.handle.db
    .update(gisLayers)
    .set({ mapping: PARCEL_MAPPING })
    .where(eq(gisLayers.key, 'parcels'))
})
afterEach(async () => {
  await world.handle.drop()
})

async function parcelsLayer() {
  const [layer] = await world.handle.db.select().from(gisLayers).where(eq(gisLayers.key, 'parcels'))
  if (layer === undefined) throw new Error('parcels layer missing')
  return layer
}

describe('saving a CAMA mapping makes CAMA the only owner source', () => {
  it('drops owner and mailing fields from the parcels mapping and audits the change', async () => {
    const auditBefore = await world.handle.db.select().from(auditLog)
    const saved = await saveCamaMapping(world.handle.db, world.staff, DEFAULT_CAMA_MAPPING, signal)
    expect(saved.ok).toBe(true)
    expect((await parcelsLayer()).mapping).toEqual(PARCEL_MAPPING_WITHOUT_OWNER)
    const audits = await world.handle.db.select().from(auditLog)
    expect(audits.length - auditBefore.length).toBe(2)
    expect(audits.some((a) => a.entityType === 'gis_layer' && a.entityId === 'parcels')).toBe(true)
  })

  it('lets the layer settings form save the parcels layer unchanged afterwards', async () => {
    await saveCamaMapping(world.handle.db, world.staff, DEFAULT_CAMA_MAPPING, signal)
    const layer = await parcelsLayer()
    const admin = await staffActor(world.handle.db, 'admin')
    const result = await updateLayerSettings(
      world.handle.db,
      admin,
      {
        key: 'parcels',
        adapter: layer.adapter,
        sourceUrl: layer.sourceUrl,
        mapping: JSON.stringify(layer.mapping),
        staleAfterDays: layer.staleAfterDays,
        refreshIntervalHours: layer.refreshIntervalHours,
      },
      signal,
    )
    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('a refused save leaves the parcels mapping alone', async () => {
    const reviewer = await staffActor(world.handle.db, 'reviewer')
    await saveCamaMapping(world.handle.db, reviewer, DEFAULT_CAMA_MAPPING, signal)
    expect((await parcelsLayer()).mapping).toEqual(PARCEL_MAPPING)
  })
})
