import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AXISGIS_ADAPTER_STATUS, readAxisGisLayer } from '@/features/gis/adapters/axisGis'
import { refreshLayer } from '@/features/gis/refreshLayer'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, fixtureFetch, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING, {
    adapter: 'axisgis',
    sourceUrl: 'https://axis.alderpond.example/arcgis/rest/services/TaxParcels/FeatureServer/0',
  })
})
afterEach(async () => {
  await handle.drop()
})

describe('axisgis adapter', () => {
  it('connects, first run creates 36 parcels, second run applies nothing, and reports stubbed', async () => {
    const config = {
      layerUrl: 'https://axis.alderpond.example/arcgis/rest/services/TaxParcels/FeatureServer/0',
    }
    const read = await readAxisGisLayer(config, fixtureFetch('axisgis'), signal)
    expect(read.ok && read.value).toHaveLength(36)
    const actor = await staffActor(handle.db)
    const importer = { kind: 'user' as const, userId: actor.userId }
    const first = await refreshLayer(
      handle.db,
      importer,
      'parcels',
      fixtureFetch('axisgis'),
      signal,
    )
    expect(first.ok && first.value.countCreated).toBe(36)
    const second = await refreshLayer(
      handle.db,
      importer,
      'parcels',
      fixtureFetch('axisgis'),
      signal,
    )
    expect(second.ok && second.value).toMatchObject({
      countCreated: 0,
      countApplied: 0,
      countUnchanged: 36,
    })
    expect(AXISGIS_ADAPTER_STATUS).toBe('stubbed')
  })
})
