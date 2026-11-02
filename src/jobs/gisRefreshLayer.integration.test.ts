import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gisLayers } from '@/db/schema'
import { dueLayerKeys, gisRefreshLayerJob } from '@/jobs/gisRefreshLayer'
import { makeTestDb, type TestDb } from '@/test/db'

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
