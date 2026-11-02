import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gisLayers } from '@/db/schema'
import { runImport } from '@/features/gis/import/runImport'
import { recordLineageEvent } from '@/features/parcels/lineage'
import { getPublicParcelView, resolveIdRoute } from '@/features/parcels/publicParcelView'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-06-01T12:00:00Z')
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING)
})
afterEach(async () => {
  await handle.drop()
})

async function importFixture() {
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
  return actor
}

async function idOf(value: string): Promise<string> {
  const alias = await handle.db.query.parcelAliases.findFirst({
    where: (a, { eq: same }) => same(a.value, value),
  })
  return alias?.parcelId ?? ''
}

describe('getPublicParcelView', () => {
  it('public view omits mailing address, exception counts, and override data', async () => {
    await importFixture()
    const r = await getPublicParcelView(handle.db, await idOf('007001000000'), new Date(), signal)
    if (!r.ok) throw new Error('view')
    expect('mailingAddress' in r.value).toBe(false)
    expect('openExceptions' in r.value).toBe(false)
    expect(JSON.stringify(r.value)).not.toContain('PO Box')
    expect(r.value.owner).toMatchObject({ state: 'known', value: 'Larkspur Family Trust' })
    expect(r.value.ids.map((i) => i.label).sort()).toEqual(['CAMA number', 'Map-lot ID'])
  })

  it('needs no actor: the loader takes none and a never-imported layer reads unknown', async () => {
    const id = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
    const r = await getPublicParcelView(handle.db, id, NOW, signal)
    expect(r.ok && r.value.owner).toEqual({ state: 'unknown' })
    expect(r.ok && r.value.layer.state).toBe('never_imported')
  })

  it('reports a stale layer', async () => {
    await importFixture()
    await handle.db
      .update(gisLayers)
      .set({ lastSuccessAt: new Date('2027-01-01T15:00:00Z') })
      .where(eq(gisLayers.key, 'parcels'))
    const r = await getPublicParcelView(handle.db, await idOf('007001000000'), NOW, signal)
    expect(r.ok && r.value.layer.state).toBe('stale')
    expect(r.ok && r.value.owner.state).toBe('stale')
  })

  it('retired parcel carries its retirement date and children', async () => {
    const actor = await staffActor(handle.db)
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007020000000' }])
    const a = await makeParcel(handle.db, [{ format: 'gis12', value: '007020001000' }])
    const b = await makeParcel(handle.db, [{ format: 'gis12', value: '007020002000' }])
    await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'subdivision',
        effectiveDate: '2027-04-12' as CivilDate,
        effectiveBasis: 'recording',
        parents: [p],
        children: [a, b],
      },
      signal,
      NOW,
    )
    const r = await getPublicParcelView(handle.db, p, NOW, signal)
    if (!r.ok) throw new Error('view')
    expect(r.value).toMatchObject({ status: 'retired', retiredOn: '2027-04-12' })
    expect(r.value.lineage.children.map((c) => c.parcelId).sort()).toEqual([a, b].sort())
    expect(r.value.ids[0]).toMatchObject({ value: '007020000000', retired: true })
  })

  it('unknown parcel is not_found', async () => {
    const r = await getPublicParcelView(
      handle.db,
      '00000000-0000-4000-8000-000000000000',
      NOW,
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('resolveIdRoute', () => {
  it('alias redirect for a retired id lands on the parcel', async () => {
    const p = await makeParcel(handle.db, [
      { format: 'gis12', value: '007020000000', status: 'retired' },
    ])
    expect(await resolveIdRoute(handle.db, 'gis12', '007-020-000-000', signal)).toEqual({
      kind: 'redirect',
      parcelId: p,
    })
  })

  it('several retired candidates give a chooser', async () => {
    const a = await makeParcel(handle.db, [
      { format: 'gis12', value: '007021000000', status: 'retired' },
    ])
    const b = await makeParcel(handle.db, [
      { format: 'gis12', value: '007021000000', status: 'retired' },
    ])
    const r = await resolveIdRoute(handle.db, 'gis12', '007021000000', signal)
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous')
      expect(r.choices.map((c) => c.parcelId).sort()).toEqual([a, b].sort())
  })

  it('unknown id is not_found', async () => {
    expect(await resolveIdRoute(handle.db, 'gis12', '999999999999', signal)).toEqual({
      kind: 'not_found',
    })
  })
})
