import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runImport } from '@/features/gis/import/runImport'
import { tileFor } from '@/features/gis/tiles'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const Z = 16
let handle: TestDb

function tileOf(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor(((lon + 180) / 360) * n)
  const rad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n)
  return { x, y }
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING)
  const actor = await staffActor(handle.db)
  const r = await runImport(
    handle.db,
    { kind: 'user', userId: actor.userId },
    {
      layerKey: 'parcels',
      adapter: 'file_geojson',
      features: loadGeoJsonFixture('alder-pond-parcels.geojson'),
      fullLayer: true,
    },
    signal,
  )
  if (!r.ok) throw new Error(r.error)
})
afterAll(async () => {
  await handle.drop()
})

describe('tileFor', () => {
  it('tile at z 16 over the fixture grid decodes to 36 or fewer features with only the three properties', async () => {
    const { x, y } = tileOf(-71.6065, 43.8722, Z)
    const r = await tileFor(handle.db, 'parcels', Z, x, y, signal)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const layer = new VectorTile(new PbfReader(r.value)).layers.parcels
    expect(layer).toBeDefined()
    expect(layer?.length).toBeGreaterThan(0)
    expect(layer?.length).toBeLessThanOrEqual(36)
    const keys = new Set<string>()
    for (let i = 0; i < (layer?.length ?? 0); i += 1) {
      for (const k of Object.keys(layer?.feature(i).properties ?? {})) keys.add(k)
    }
    expect([...keys].sort()).toEqual(['display_id', 'parcel_id', 'status'])
  })

  it('a tile far from the grid is empty but ok', async () => {
    const r = await tileFor(handle.db, 'parcels', Z, 100, 100, signal)
    expect(r.ok && r.value.length).toBe(0)
  })

  it('z 9 is bad_tile', async () => {
    expect(await tileFor(handle.db, 'parcels', 9, 0, 0, signal)).toEqual({
      ok: false,
      error: 'bad_tile',
    })
  })

  it('out of range x is bad_tile', async () => {
    expect(await tileFor(handle.db, 'parcels', 10, 5000, 0, signal)).toEqual({
      ok: false,
      error: 'bad_tile',
    })
  })

  it('water layer with no adapter is layer_not_configured', async () => {
    expect(await tileFor(handle.db, 'water', Z, 1, 1, signal)).toEqual({
      ok: false,
      error: 'layer_not_configured',
    })
  })
})

describe('parcelExtent', () => {
  it('covers the imported grid', async () => {
    const { parcelExtent } = await import('@/features/gis/extent')
    const box = await parcelExtent(handle.db, signal)
    expect(box).not.toBeNull()
    expect(box?.[0]).toBeGreaterThan(-71.61)
    expect(box?.[3]).toBeGreaterThan(43.87)
  })
})
