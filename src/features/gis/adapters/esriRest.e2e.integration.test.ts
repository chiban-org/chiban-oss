import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gisLayers, importExceptions, parcelAliases, parcels } from '@/db/schema'
import { readEsriLayer } from '@/features/gis/adapters/esriRest'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { refreshLayer } from '@/features/gis/refreshLayer'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, fixtureFetch, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const LAYER_URL = 'https://gis.alderpond.example/arcgis/rest/services/Parcels/FeatureServer/0'
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING, {
    adapter: 'esri_rest',
    sourceUrl: LAYER_URL,
  })
})
afterEach(async () => {
  await handle.drop()
})

async function refresh(deps: ReturnType<typeof fixtureFetch>) {
  const actor = await staffActor(handle.db)
  return await refreshLayer(
    handle.db,
    { kind: 'user', userId: actor.userId },
    'parcels',
    deps,
    signal,
  )
}

describe('esri rest adapter', () => {
  it('connect reads metadata and paginates three pages', async () => {
    const deps = fixtureFetch('esri')
    const r = await readEsriLayer(LAYER_URL, deps, signal)
    expect(r.ok && r.value).toHaveLength(36)
    expect(deps.calls).toHaveLength(4)
    expect(deps.calls[1]).toContain('outSR=4326')
    expect(deps.calls[1]).toContain('orderByFields=OBJECTID')
    expect(deps.calls[1]).toContain('resultRecordCount=15')
    expect(deps.calls[3]).toContain('resultOffset=30')
  })

  it('first run creates 36 parcels', async () => {
    const r = await refresh(fixtureFetch('esri'))
    expect(r.ok && r.value.countCreated).toBe(36)
  })

  it('second run applies nothing', async () => {
    await refresh(fixtureFetch('esri'))
    const r = await refresh(fixtureFetch('esri'))
    expect(r.ok && r.value).toMatchObject({ countCreated: 0, countApplied: 0, countUnchanged: 36 })
  })

  it('esri string id field keeps leading zeros', async () => {
    await refresh(fixtureFetch('esri'))
    const [alias] = await handle.db
      .select()
      .from(parcelAliases)
      .where(eq(parcelAliases.valueNormalized, '007001000000'))
    expect(alias?.value).toBe('007001000000')
  })

  it('error body is service_error and nothing is applied', async () => {
    const deps = fixtureFetch('esri', { errorBody: true })
    expect(await readEsriLayer(LAYER_URL, deps, signal)).toMatchObject({
      ok: false,
      error: { kind: 'service_error' },
    })
    await refresh(fixtureFetch('esri', { errorBody: true }))
    expect(await handle.db.select().from(parcels)).toHaveLength(0)
    expect(await handle.db.select().from(importExceptions)).toHaveLength(0)
  })

  it('failure on page 2 applies nothing and marks the layer import_failed', async () => {
    const deps = fixtureFetch('esri', { failOnPage: 1 })
    expect(await readEsriLayer(LAYER_URL, deps, signal)).toMatchObject({
      ok: false,
      error: { kind: 'unreachable' },
    })
    const r = await refresh(fixtureFetch('esri', { failOnPage: 1 }))
    expect(r.ok).toBe(false)
    expect(await handle.db.select().from(parcels)).toHaveLength(0)
    const status = await getLayerStatus(handle.db, 'parcels', new Date(), signal)
    expect(status.state).toBe('import_failed')
    const [layer] = await handle.db.select().from(gisLayers).where(eq(gisLayers.key, 'parcels'))
    expect(layer?.lastError).toContain('connection reset')
  })

  it('a layer with no source url is not configured', async () => {
    await configureLayer(handle.db, 'parcels', PARCEL_MAPPING, { sourceUrl: null })
    const r = await refresh(fixtureFetch('esri'))
    expect(r).toEqual({ ok: false, error: 'layer_not_configured' })
  })
})
