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

function expectInvariant(r: ImportRunReport): void {
  expect(r.countIn).toBe(r.countCreated + r.countApplied + r.countUnchanged + r.countExcepted)
}

async function userActor() {
  const actor = await staffActor(handle.db)
  return { actor, importer: { kind: 'user' as const, userId: actor.userId } }
}

async function runOk(features: SourceFeature[], fullLayer = true): Promise<ImportRunReport> {
  const { importer } = await userActor()
  const r = await runImport(handle.db, importer, input(features, fullLayer), signal)
  if (!r.ok) throw new Error(`import failed: ${r.error}`)
  expectInvariant(r.value)
  return r.value
}

describe('runImport', () => {
  it('first run creates 36 parcels from alder-pond-parcels.geojson', async () => {
    const report = await runOk(loadGeoJsonFixture('alder-pond-parcels.geojson'))
    expect(report).toMatchObject({ countCreated: 36, countExcepted: 0, countIn: 36 })
    const rows = await handle.db.select().from(parcels)
    expect(rows).toHaveLength(36)
    const [layer] = await handle.db.select().from(gisLayers).where(eq(gisLayers.key, 'parcels'))
    expect(layer?.lastSuccessAt).not.toBeNull()
  })

  it('second identical run is a no-op', async () => {
    const features = loadGeoJsonFixture('alder-pond-parcels-dirty.geojson')
    const first = await runOk(features)
    expect(first).toMatchObject({ countCreated: 35, countExcepted: 1 })
    const before = await handle.db.select().from(importExceptions)
    const second = await runOk(features)
    expect(second).toMatchObject({
      countCreated: 0,
      countApplied: 0,
      countUnchanged: 35,
      countExcepted: 1,
    })
    const after = await handle.db.select().from(importExceptions)
    expect(after).toHaveLength(before.length)
    expect(after[0]?.lastSeenRunId).toBe(second.runId)
    expect(after[0]?.firstRunId).toBe(first.runId)
  })

  it('numeric id without padNumeric is excepted', async () => {
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const [first] = features
    if (first) first.properties.MAPLOT = 7001000000
    const report = await runOk(features)
    expect(report.exceptionsByKind.id_numeric_lost_zeros).toBe(1)
    expect(report.countCreated).toBe(35)
  })

  it('numeric id with padNumeric becomes the padded string', async () => {
    await configureLayer(handle.db, 'parcels', {
      ...PARCEL_MAPPING,
      primaryId: { ...PARCEL_MAPPING.primaryId, padNumeric: true },
    })
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const [first] = features
    if (first) first.properties.MAPLOT = 7001000000
    const report = await runOk(features)
    expect(report.countCreated).toBe(36)
    const [alias] = await handle.db
      .select()
      .from(parcelAliases)
      .where(eq(parcelAliases.value, '007001000000'))
    expect(alias?.format).toBe('gis12')
  })

  it('leading zeros survive as strings', async () => {
    await runOk(loadGeoJsonFixture('alder-pond-parcels.geojson'))
    const [alias] = await handle.db
      .select()
      .from(parcelAliases)
      .where(eq(parcelAliases.valueNormalized, '007001000000'))
    expect(typeof alias?.value).toBe('string')
    expect(alias?.value).toBe('007001000000')
  })

  it('bowtie geometry goes to the queue with the PostGIS reason', async () => {
    await runOk(loadGeoJsonFixture('alder-pond-parcels-dirty.geojson'))
    const [row] = await handle.db.select().from(importExceptions)
    expect(row?.kind).toBe('invalid_geometry')
    expect(row?.detail).toMatch(/Self-intersection/)
    expect(row?.rowKey).toBe('id:008006000000')
  })

  it('missing geometry and missing id are excepted', async () => {
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const [a, b] = features
    if (a) a.geometry = null
    if (b) b.properties.MAPLOT = null
    const report = await runOk(features)
    expect(report.exceptionsByKind).toMatchObject({
      missing_geometry: 1,
      missing_required_field: 1,
    })
  })

  it('owner change is held and nothing in the row changes', async () => {
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    await runOk(features)
    const [first] = features
    if (first) {
      first.properties.OWNER = 'Someone Else'
      first.properties.SITE_ADDR = '99 Moved Street'
    }
    const report = await runOk(features)
    expect(report).toMatchObject({ countExcepted: 1, countApplied: 0, countUnchanged: 35 })
    expect(report.exceptionsByKind.owner_changed).toBe(1)
    const [p] = await handle.db
      .select()
      .from(parcels)
      .where(eq(parcels.siteAddress, '12 Heron Cove Road'))
    expect(p?.ownerName).toBe('Larkspur Family Trust')
  })

  it('a null stored owner is filled without an exception', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
    const report = await runOk(loadGeoJsonFixture('alder-pond-parcels.geojson'))
    expect(report).toMatchObject({ countApplied: 1, countCreated: 35, countExcepted: 0 })
  })

  it('acceptHeldRow applies the held row and audits it', async () => {
    const { actor } = await userActor()
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    await runOk(features)
    const [first] = features
    if (first) first.properties.OWNER = 'Someone Else'
    await runOk(features)
    const [held] = await handle.db
      .select()
      .from(importExceptions)
      .where(eq(importExceptions.kind, 'owner_changed'))
    const r = await acceptHeldRow(handle.db, actor, held?.id ?? '', signal)
    expect(r.ok).toBe(true)
    const [p] = await handle.db
      .select()
      .from(parcels)
      .where(eq(parcels.siteAddress, '12 Heron Cove Road'))
    expect(p?.ownerName).toBe('Someone Else')
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'parcel.accept_held_row'))
    expect(audit).toHaveLength(1)
    expect(audit[0]?.actorUserId).toBe(actor.userId)
  })

  it('acceptAllOwnerChanges accepts only owner_changed rows of that run', async () => {
    const { actor } = await userActor()
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    await runOk(features)
    const [one, two] = features
    if (!one || !two) throw new Error('fixture')
    one.properties.OWNER = 'Owner One'
    await runOk(features)
    two.properties.OWNER = 'Owner Two'
    const second = await runOk([two], false)
    const r = await acceptAllOwnerChanges(handle.db, actor, second.runId, signal)
    expect(r).toEqual({ ok: true, value: { accepted: 1 } })
    const open = await handle.db
      .select()
      .from(importExceptions)
      .where(eq(importExceptions.status, 'open'))
    expect(open).toHaveLength(1)
  })

  it('parcel missing from a full layer is kept and excepted', async () => {
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    await runOk(features)
    const report = await runOk(features.slice(1))
    expect(report.countMissingFromLayer).toBe(1)
    expect(report.exceptionsByKind.missing_from_layer).toBe(1)
    const rows = await handle.db.select().from(parcels).where(eq(parcels.status, 'active'))
    expect(rows).toHaveLength(36)
  })

  it('a partial run never reports missing parcels', async () => {
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    await runOk(features)
    const report = await runOk(features.slice(1), false)
    expect(report.countMissingFromLayer).toBe(0)
  })

  it('two features with one id merge into one parcel', async () => {
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const [first] = features
    const last = features[35]
    if (!first || !last) throw new Error('fixture')
    features.push({ rowRef: '36', properties: { ...first.properties }, geometry: last.geometry })
    const report = await runOk(features)
    expect(report).toMatchObject({ countMergedParts: 1, countCreated: 36, countIn: 36 })
    expect(report.countSourceFeatures).toBe(37)
  })

  it('extra id owned by an override is alias_conflicts_override', async () => {
    const other = await makeParcel(handle.db, [])
    await handle.db.insert(parcelAliases).values({
      parcelId: other,
      format: 'cama15',
      value: '007001000000000',
      valueNormalized: '007001000000000',
      source: 'override',
    })
    const report = await runOk(loadGeoJsonFixture('alder-pond-parcels.geojson'))
    expect(report.exceptionsByKind.alias_conflicts_override).toBe(1)
  })

  it('extra id owned by another parcel is alias_conflict', async () => {
    await makeParcel(handle.db, [{ format: 'cama15', value: '007002000000000' }])
    const report = await runOk(loadGeoJsonFixture('alder-pond-parcels.geojson'))
    expect(report.exceptionsByKind.alias_conflict).toBe(1)
  })

  it('a primary id that resolves to a retired parcel is excepted', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000', status: 'retired' }], {
      status: 'retired',
    })
    const report = await runOk(loadGeoJsonFixture('alder-pond-parcels.geojson'))
    expect(report.exceptionsByKind.id_resolves_to_retired).toBe(1)
  })

  it('condo parcel collects three cama aliases', async () => {
    await runOk(loadGeoJsonFixture('alder-pond-parcels.geojson'))
    const rows = await handle.db
      .select()
      .from(parcelAliases)
      .where(eq(parcelAliases.format, 'cama15'))
    const condo = rows.filter((r) => r.value.startsWith('007014000000'))
    expect(condo.map((r) => r.value).sort()).toEqual([
      '007014000000001',
      '007014000000002',
      '007014000000003',
    ])
    expect(new Set(condo.map((r) => r.parcelId)).size).toBe(1)
  })
})
