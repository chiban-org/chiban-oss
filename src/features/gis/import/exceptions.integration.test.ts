import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importExceptions, parcels } from '@/db/schema'
import { acceptHeldRow, dismissException } from '@/features/gis/import/exceptions'
import { runImport } from '@/features/gis/import/runImport'
import type { SourceFeature } from '@/features/gis/import/types'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

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

async function run(features: SourceFeature[]) {
  const actor = await staffActor(handle.db)
  const r = await runImport(
    handle.db,
    { kind: 'user', userId: actor.userId },
    { layerKey: 'parcels', adapter: 'file_geojson', features, fullLayer: true },
    signal,
  )
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('exception dispositions', () => {
  it('dismiss without a reason is refused', async () => {
    const actor = await staffActor(handle.db)
    await run(loadGeoJsonFixture('alder-pond-parcels-dirty.geojson'))
    const [row] = await handle.db.select().from(importExceptions)
    expect(await dismissException(handle.db, actor, row?.id ?? '', '  ', signal)).toEqual({
      ok: false,
      error: 'reason_required',
    })
    expect(
      (await dismissException(handle.db, actor, row?.id ?? '', 'bad source data', signal)).ok,
    ).toBe(true)
    const [after] = await handle.db.select().from(importExceptions)
    expect(after).toMatchObject({ status: 'dismissed', dispositionReason: 'bad source data' })
  })

  it('reviewer cannot dismiss or accept', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    await run(loadGeoJsonFixture('alder-pond-parcels-dirty.geojson'))
    const [row] = await handle.db.select().from(importExceptions)
    expect(await dismissException(handle.db, reviewer, row?.id ?? '', 'x', signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await acceptHeldRow(handle.db, reviewer, row?.id ?? '', signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('a clean rerun resolves the exception', async () => {
    await run(loadGeoJsonFixture('alder-pond-parcels-dirty.geojson'))
    await run(loadGeoJsonFixture('alder-pond-parcels.geojson'))
    const rows = await handle.db.select().from(importExceptions)
    expect(rows.map((r) => r.status)).toEqual(['resolved_by_rerun'])
  })

  it('a held row is no longer valid when the stored owner changed since', async () => {
    const actor = await staffActor(handle.db)
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    await run(features)
    const [first] = features
    if (first) first.properties.OWNER = 'Someone Else'
    await run(features)
    await handle.db
      .update(parcels)
      .set({ ownerName: 'Changed By Hand' })
      .where(eq(parcels.siteAddress, '12 Heron Cove Road'))
    const [held] = await handle.db
      .select()
      .from(importExceptions)
      .where(eq(importExceptions.kind, 'owner_changed'))
    expect(await acceptHeldRow(handle.db, actor, held?.id ?? '', signal)).toEqual({
      ok: false,
      error: 'no_longer_valid',
    })
  })
})
