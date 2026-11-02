import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  auditLog,
  gisFeatures,
  gisLayers,
  importExceptions,
  importRuns,
  parcelAliases,
  parcels,
} from '@/db/schema'
import { acceptAllOwnerChanges, acceptHeldRow } from '@/features/gis/import/exceptions'
import { runImport } from '@/features/gis/import/runImport'
import type { ImportInput, ImportRunReport, SourceFeature } from '@/features/gis/import/types'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING)
})
afterEach(async () => {
  await handle.drop()
})

function input(features: SourceFeature[], fullLayer = true): ImportInput {
  return { layerKey: 'parcels', adapter: 'file_geojson', features, fullLayer }
}

async function userActor() {
  const actor = await staffActor(handle.db)
  return { actor, importer: { kind: 'user' as const, userId: actor.userId } }
}

describe('runImport safety', () => {
  it('concurrent run is refused while another holds the layer lock', async () => {
    const { importer } = await userActor()
    const client = await handle.pool.connect()
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('gis_import:parcels'))")
      const r = await runImport(
        handle.db,
        importer,
        input(loadGeoJsonFixture('alder-pond-parcels.geojson')),
        signal,
      )
      expect(r).toEqual({ ok: false, error: 'import_in_progress' })
      await client.query("SELECT pg_advisory_unlock(hashtext('gis_import:parcels'))")
    } finally {
      client.release()
    }
  })

  it('eight concurrent runs never duplicate a parcel', async () => {
    const { importer } = await userActor()
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const timed = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const started = Date.now()
        const r = await runImport(handle.db, importer, input(features), signal)
        return { r, ms: Date.now() - started }
      }),
    )
    for (const { r, ms } of timed) {
      expect(r.ok || r.error === 'import_in_progress').toBe(true)
      expect(ms).toBeLessThan(10_000)
    }
    expect(timed.some(({ r }) => r.ok)).toBe(true)
    const all = await handle.db.select().from(parcels)
    expect(all).toHaveLength(36)
    const active = await handle.db
      .select()
      .from(parcelAliases)
      .where(sql`${parcelAliases.format} = 'gis12' AND ${parcelAliases.status} = 'active'`)
    expect(active).toHaveLength(36)
  })

  it('failed run leaves no partial rows and records last_failure_at', async () => {
    const { importer } = await userActor()
    let calls = 0
    const base = new AbortController().signal
    const flaky = new Proxy(base, {
      get(target, prop) {
        if (prop === 'throwIfAborted') {
          return () => {
            calls += 1
            if (calls > 60) throw new DOMException('aborted', 'AbortError')
          }
        }
        const value: unknown = Reflect.get(target, prop)
        return typeof value === 'function' ? (value.bind(target) as unknown) : value
      },
    })
    const r = await runImport(
      handle.db,
      importer,
      input(loadGeoJsonFixture('alder-pond-parcels.geojson')),
      flaky,
    )
    expect(r).toEqual({ ok: false, error: 'import_failed' })
    expect(await handle.db.select().from(parcels)).toHaveLength(0)
    const [layer] = await handle.db.select().from(gisLayers).where(eq(gisLayers.key, 'parcels'))
    expect(layer?.lastFailureAt).not.toBeNull()
    expect(layer?.lastSuccessAt).toBeNull()
    const runs = await handle.db.select().from(importRuns)
    expect(runs.map((x) => x.status)).toEqual(['failed'])
  })

  it('applicant gets forbidden', async () => {
    const actor = await staffActor(handle.db, 'applicant')
    const r = await runImport(
      handle.db,
      { kind: 'user', userId: actor.userId },
      input(loadGeoJsonFixture('alder-pond-parcels.geojson')),
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('imports roads into gis_features and is idempotent', async () => {
    await configureLayer(handle.db, 'roads', { sourceKey: 'ROAD_ID', name: 'NAME' })
    const { importer } = await userActor()
    const features = loadGeoJsonFixture('alder-pond-roads.geojson')
    const run = () =>
      runImport(
        handle.db,
        importer,
        { layerKey: 'roads', adapter: 'file_geojson', features, fullLayer: true },
        signal,
      )
    const first = await run()
    expect(first.ok && first.value.countCreated).toBe(7)
    const second = await run()
    expect(second.ok && second.value.countUnchanged).toBe(7)
    expect(await handle.db.select().from(gisFeatures)).toHaveLength(7)
  })
})
