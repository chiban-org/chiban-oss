import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  auditLog,
  gisFeatures,
  gisLayers,
  importExceptions,
  importRuns,
  parcelAliases,
  parcelIdFormats,
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
  describe('bad geometry rows', () => {
    const square = (offset: number): GeoJSON.Polygon => ({
      type: 'Polygon',
      coordinates: [
        [
          [-71.5 + offset, 43.2],
          [-71.499 + offset, 43.2],
          [-71.499 + offset, 43.201],
          [-71.5 + offset, 43.2],
        ],
      ],
    })
    const props = (id: string) => ({ MAPLOT: id })

    async function importAll(features: SourceFeature[]) {
      const { importer } = await userActor()
      const r = await runImport(handle.db, importer, input(features), signal)
      if (!r.ok) throw new Error(r.error)
      return r.value
    }

    it('malformed coordinates become an exception and the valid rows still apply', async () => {
      const malformed = { type: 'Polygon', coordinates: [[['x', 1]]] } as unknown as GeoJSON.Polygon
      const report = await importAll([
        { rowRef: '0', properties: props('007001000000'), geometry: square(0) },
        { rowRef: '1', properties: props('007002000000'), geometry: malformed },
        { rowRef: '2', properties: props('007003000000'), geometry: square(0.01) },
      ])
      expect(report.countCreated).toBe(2)
      expect(report.exceptionsByKind).toEqual({ invalid_geometry: 1 })
      expect(await handle.db.select().from(parcels)).toHaveLength(2)
    })

    it('an empty polygon is an exception and never replaces a stored boundary', async () => {
      await importAll([{ rowRef: '0', properties: props('007001000000'), geometry: square(0) }])
      const empty: GeoJSON.Polygon = { type: 'Polygon', coordinates: [] }
      const report = await importAll([
        { rowRef: '0', properties: props('007001000000'), geometry: empty },
      ])
      expect(report.exceptionsByKind).toEqual({ invalid_geometry: 1 })
      const [stored] = await handle.db.select().from(parcels)
      expect(stored?.geom).not.toBeNull()
    })

    it('a merged row with one part missing its geometry is excepted as missing geometry', async () => {
      const report = await importAll([
        { rowRef: '0', properties: props('007001000000'), geometry: square(0) },
        { rowRef: '1', properties: props('007001000000'), geometry: null },
      ])
      expect(report.exceptionsByKind).toEqual({ missing_geometry: 1 })
      expect(await handle.db.select().from(parcels)).toHaveLength(0)
    })
  })
  it('an alias held by an override blocks a source id that differs only in punctuation', async () => {
    await handle.db
      .insert(parcelIdFormats)
      .values({ key: 'legacy', label: 'Legacy tag', kind: 'free_text', width: null })
    const held = await makeParcel(handle.db, [{ format: 'legacy', value: 'AB-12' }])
    await handle.db
      .update(parcelAliases)
      .set({ source: 'override' })
      .where(eq(parcelAliases.parcelId, held))
    await configureLayer(handle.db, 'parcels', {
      ...PARCEL_MAPPING,
      extraIds: [{ field: 'LEGACY', format: 'legacy', padNumeric: false }],
    })
    const { importer } = await userActor()
    const r = await runImport(
      handle.db,
      importer,
      input([
        {
          rowRef: '0',
          properties: { MAPLOT: '007009000000', LEGACY: 'AB12' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-71.5, 43.2],
                [-71.499, 43.2],
                [-71.499, 43.201],
                [-71.5, 43.2],
              ],
            ],
          },
        },
      ]),
      signal,
    )
    expect(r.ok && r.value.exceptionsByKind).toEqual({ alias_conflicts_override: 1 })
  })
})
