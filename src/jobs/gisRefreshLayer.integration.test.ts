import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gisLayers, parcels } from '@/db/schema'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { runJob } from '@/jobs/defineJob'
import { dueLayerKeys, gisRefreshLayerJob, makeGisRefreshLayerJob } from '@/jobs/gisRefreshLayer'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, fixtureFetch, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-01T12:00:00Z')
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

describe('dueLayerKeys', () => {
  it('skips layers with no adapter or no source url', async () => {
    expect(await dueLayerKeys(handle.db, NOW, signal)).toEqual([])
  })

  it('includes a configured layer never refreshed and skips a recently refreshed one', async () => {
    await handle.db
      .update(gisLayers)
      .set({ adapter: 'esri_rest', sourceUrl: 'https://gis.alderpond.example/layer/0' })
      .where(eq(gisLayers.key, 'parcels'))
    expect(await dueLayerKeys(handle.db, NOW, signal)).toEqual(['parcels'])
    await handle.db
      .update(gisLayers)
      .set({ lastSuccessAt: new Date('2027-03-01T06:00:00Z'), refreshIntervalHours: 24 })
      .where(eq(gisLayers.key, 'parcels'))
    expect(await dueLayerKeys(handle.db, NOW, signal)).toEqual([])
    await handle.db
      .update(gisLayers)
      .set({ lastSuccessAt: new Date('2027-02-27T06:00:00Z') })
      .where(eq(gisLayers.key, 'parcels'))
    expect(await dueLayerKeys(handle.db, NOW, signal)).toEqual(['parcels'])
  })
})

describe('gisRefreshLayerJob', () => {
  it('dedup key is the layer plus the hour bucket', () => {
    const key = gisRefreshLayerJob.dedupKey({ layerKey: 'parcels' })
    expect(key).toMatch(/^parcels:\d+$/)
  })
})

describe('gis refresh job through the transactional runner', () => {
  const LAYER_URL = 'https://gis.alderpond.example/arcgis/rest/services/Parcels/FeatureServer/0'

  it('imports using only ctx.db, and a second run in the same hour is skipped', async () => {
    const local = await makeTestDb()
    try {
      await seedParcelWorld(local.db)
      await configureLayer(local.db, 'parcels', PARCEL_MAPPING, {
        adapter: 'esri_rest',
        sourceUrl: LAYER_URL,
      })
      const job = makeGisRefreshLayerJob(fixtureFetch('esri').fetch)
      expect((await runJob(local.db, job, { layerKey: 'parcels' }, signal)).ok).toBe(true)
      expect(await local.db.select().from(parcels)).toHaveLength(36)
      const calls = fixtureFetch('esri')
      const again = makeGisRefreshLayerJob(calls.fetch)
      expect((await runJob(local.db, again, { layerKey: 'parcels' }, signal)).ok).toBe(true)
      expect(calls.calls).toHaveLength(0)
    } finally {
      await local.drop()
    }
  })

  it('a failed source read is recorded on the layer and survives the job transaction', async () => {
    const local = await makeTestDb()
    try {
      await seedParcelWorld(local.db)
      await configureLayer(local.db, 'parcels', PARCEL_MAPPING, {
        adapter: 'esri_rest',
        sourceUrl: LAYER_URL,
      })
      const job = makeGisRefreshLayerJob(fixtureFetch('esri', { failOnPage: 1 }).fetch)
      await runJob(local.db, job, { layerKey: 'parcels' }, signal)
      expect((await getLayerStatus(local.db, 'parcels', new Date(), signal)).state).toBe(
        'import_failed',
      )
    } finally {
      await local.drop()
    }
  })
})
