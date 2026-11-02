import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gisLayers, importExceptions } from '@/db/schema'
import { listExceptions } from '@/features/gis/exceptionsList'
import { runImport } from '@/features/gis/import/runImport'
import { getStaffParcelView } from '@/features/parcels/staffParcelView'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-01T15:00:00Z')
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING)
})
afterEach(async () => {
  await handle.drop()
})

describe('getStaffParcelView', () => {
  it('never-imported layer returns unknown for owner, not null', async () => {
    const actor = await staffActor(handle.db)
    const id = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
    const r = await getStaffParcelView(handle.db, actor, id, NOW, signal)
    expect(r.ok && r.value.owner).toEqual({ state: 'unknown' })
    expect(r.ok && r.value.geometry).toEqual({ state: 'unknown' })
    expect(r.ok && r.value.layer.state).toBe('never_imported')
  })

  it('after a failed run returns import_failed with the last value', async () => {
    const actor = await staffActor(handle.db)
    const id = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }], {
      ownerName: 'Larkspur Family Trust',
    })
    await handle.db
      .update(gisLayers)
      .set({
        lastSuccessAt: new Date('2027-01-01T15:00:00Z'),
        lastFailureAt: new Date('2027-02-01T15:00:00Z'),
        lastError: 'unreachable',
      })
      .where(eq(gisLayers.key, 'parcels'))
    const r = await getStaffParcelView(handle.db, actor, id, NOW, signal)
    expect(r.ok && r.value.owner).toEqual({
      state: 'import_failed',
      value: 'Larkspur Family Trust',
      lastSuccessAt: '2027-01-01T15:00:00.000Z',
      lastFailureAt: '2027-02-01T15:00:00.000Z',
    })
  })

  it('fresh import gives known values, aliases with labels, and an area in acres', async () => {
    const actor = await staffActor(handle.db)
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const run = await runImport(
      handle.db,
      { kind: 'user', userId: actor.userId },
      { layerKey: 'parcels', adapter: 'file_geojson', features, fullLayer: true },
      signal,
    )
    if (!run.ok) throw new Error(run.error)
    const found = await handle.db.query.parcelAliases.findFirst({
      where: (a, { eq: same }) => same(a.value, '007001000000'),
    })
    const r = await getStaffParcelView(handle.db, actor, found?.parcelId ?? '', new Date(), signal)
    if (!r.ok) throw new Error('view')
    expect(r.value.owner).toMatchObject({ state: 'known', value: 'Larkspur Family Trust' })
    expect(r.value.areaAcres).toMatchObject({ state: 'known' })
    const acres = r.value.areaAcres.state === 'known' ? r.value.areaAcres.value : 0
    expect(acres).toBeGreaterThan(1.3)
    expect(acres).toBeLessThan(1.5)
    expect(r.value.aliases.map((a) => a.label).sort()).toEqual(['CAMA number', 'Map-lot ID'])
    expect(r.value.openExceptions).toBe(0)
  })

  it('counts open exceptions that name this parcel', async () => {
    const actor = await staffActor(handle.db)
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const importer = { kind: 'user' as const, userId: actor.userId }
    const input = {
      layerKey: 'parcels' as const,
      adapter: 'file_geojson',
      features,
      fullLayer: true,
    }
    await runImport(handle.db, importer, input, signal)
    const first = features[0]
    if (first) first.properties.OWNER = 'Someone Else'
    await runImport(handle.db, importer, input, signal)
    const alias = await handle.db.query.parcelAliases.findFirst({
      where: (a, { eq: same }) => same(a.value, '007001000000'),
    })
    const r = await getStaffParcelView(handle.db, actor, alias?.parcelId ?? '', new Date(), signal)
    expect(r.ok && r.value.openExceptions).toBe(1)
  })

  it('unknown parcel is not_found', async () => {
    const actor = await staffActor(handle.db)
    const r = await getStaffParcelView(
      handle.db,
      actor,
      '00000000-0000-4000-8000-000000000000',
      NOW,
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('listExceptions', () => {
  it('lists newest first and filters by kind', async () => {
    const actor = await staffActor(handle.db)
    const importer = { kind: 'user' as const, userId: actor.userId }
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const [a, b] = features
    if (a) a.geometry = null
    if (b) b.properties.MAPLOT = null
    await runImport(
      handle.db,
      importer,
      { layerKey: 'parcels', adapter: 'file_geojson', features, fullLayer: true },
      signal,
    )
    await handle.db
      .update(importExceptions)
      .set({ createdAt: new Date('2020-01-01T00:00:00Z') })
      .where(eq(importExceptions.kind, 'missing_geometry'))
    const all = await listExceptions(handle.db, {}, signal)
    expect(all.map((e) => e.kind)).toEqual(['missing_required_field', 'missing_geometry'])
    const filtered = await listExceptions(handle.db, { kind: 'missing_geometry' }, signal)
    expect(filtered.map((e) => e.kind)).toEqual(['missing_geometry'])
  })

  it('returns fewer rows than the page cap when few exist', async () => {
    expect(await listExceptions(handle.db, { limit: 100 }, signal)).toEqual([])
  })
})
