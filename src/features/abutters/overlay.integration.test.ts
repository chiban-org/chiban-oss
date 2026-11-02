import { NH_ABUTTER_PARAMS } from '@packs/nh/abutters/params'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectionOverlay } from '@/features/abutters/overlay'
import { importScenario } from '@/test/abutterWorld'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let ids: Record<string, string>

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  ids = await importScenario(handle.db, world.staff)
})
afterEach(async () => {
  await handle.drop()
})

describe('projectionOverlay', () => {
  it('draws the corners, projected points, connectors, capture circles, and the band for A', async () => {
    const overlay = await handle.db.transaction((tx) =>
      projectionOverlay(tx, [ids.A ?? ''], NH_ABUTTER_PARAMS, 50, signal),
    )
    const kinds = overlay.features.map((f) => f.properties.kind)
    const count = (kind: string) => kinds.filter((k) => k === kind).length
    expect(count('corner')).toBe(2)
    expect(count('projected')).toBe(2)
    expect(count('connector')).toBe(2)
    expect(count('capture')).toBe(2)
    expect(count('region')).toBe(1)
    const corner = overlay.features.find((f) => f.properties.kind === 'corner')?.geometry
    expect(corner?.type).toBe('Point')
    const [lon = 0, lat = 0] = (corner as GeoJSON.Point).coordinates
    expect(lon).toBeLessThan(-70)
    expect(lat).toBeGreaterThan(42)
  })

  it('draws nothing for a parcel with no street or stream frontage', async () => {
    const overlay = await handle.db.transaction((tx) =>
      projectionOverlay(tx, [ids.M4 ?? ''], NH_ABUTTER_PARAMS, 50, signal),
    )
    expect(overlay.features).toEqual([])
  })
  it('labels nearby parcels by their number and the street by its name', async () => {
    const overlay = await handle.db.transaction((tx) =>
      projectionOverlay(tx, [ids.A ?? ''], NH_ABUTTER_PARAMS, 50, signal),
    )
    const labels = overlay.features
      .filter((f) => f.properties.kind === 'label')
      .map((f) => f.properties.text)
    expect(labels).toContain('009001000000')
    expect(labels).toContain('Osprey Point Road')
  })
})
