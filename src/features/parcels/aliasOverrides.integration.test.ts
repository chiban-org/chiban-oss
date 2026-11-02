import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aliasOverrides, importExceptions, parcelAliases } from '@/db/schema'
import { runImport } from '@/features/gis/import/runImport'
import {
  createAliasOverride,
  expireAliasOverrides,
  listAliasOverrides,
} from '@/features/parcels/aliasOverrides'
import { recordLineageEvent } from '@/features/parcels/lineage'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
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
})
afterEach(async () => {
  await handle.drop()
})

async function pair() {
  const old = await makeParcel(handle.db, [{ format: 'cama15', value: '005014000000000' }])
  const target = await makeParcel(handle.db, [{ format: 'gis12', value: '007014000000' }])
  return { old, target }
}

describe('alias overrides', () => {
  it('an override that loses a race for the id is refused and leaves no override row', async () => {
    const actor = await staffActor(handle.db)
    const rival = await makeParcel(handle.db, [])
    const target = await makeParcel(handle.db, [])
    const value = '007077000000'
    const client = await handle.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO parcel_aliases (parcel_id, format, value, value_normalized, source)
         VALUES ($1, 'gis12', $2, $2, 'manual')`,
        [rival, value],
      )
      const pending = createAliasOverride(
        handle.db,
        actor,
        { format: 'gis12', value, parcelId: target, reason: 'Claim the id' },
        signal,
        NOW,
      )
      await new Promise((resolve) => setTimeout(resolve, 300))
      await client.query('COMMIT')
      expect(await pending).toEqual({ ok: false, error: 'alias_taken' })
    } finally {
      client.release()
    }
    expect(await handle.db.select().from(aliasOverrides)).toHaveLength(0)
    const holders = await handle.db
      .select()
      .from(parcelAliases)
      .where(eq(parcelAliases.value, '007077000000'))
    expect(holders.map((h) => h.parcelId)).toEqual([rival])
  })

  it('override repoints an id and records the replaced parcel', async () => {
    const actor = await staffActor(handle.db)
    const { old, target } = await pair()
    const r = await createAliasOverride(
      handle.db,
      actor,
      {
        format: 'cama15',
        value: '005014000000000',
        parcelId: target,
        reason: 'Folder label uses old map number',
      },
      signal,
      NOW,
    )
    expect(r.ok).toBe(true)
    const resolved = await resolveParcelId(
      handle.db,
      { format: 'cama15', value: '005014000000000' },
      signal,
    )
    expect(resolved).toEqual({ ok: true, value: { parcelId: target, via: 'active' } })
    const [row] = await listAliasOverrides(handle.db, NOW, signal)
    expect(row).toMatchObject({
      status: 'applied',
      parcelId: target,
      parcelDisplayId: '007014000000',
      reason: 'Folder label uses old map number',
    })
    expect(row?.replaced?.parcelId).toBe(old)
    expect(row?.createdBy).toBe(actor.userId)
  })

  it('second override supersedes the first', async () => {
    const actor = await staffActor(handle.db)
    const { target } = await pair()
    const other = await makeParcel(handle.db, [{ format: 'gis12', value: '007015000000' }])
    const input = { format: 'cama15', value: '005014000000000', reason: 'first' }
    await createAliasOverride(handle.db, actor, { ...input, parcelId: target }, signal, NOW)
    await createAliasOverride(
      handle.db,
      actor,
      { ...input, parcelId: other, reason: 'second' },
      signal,
      NOW,
    )
    const rows = await listAliasOverrides(handle.db, NOW, signal)
    expect(rows.map((r) => [r.reason, r.status]).sort()).toEqual([
      ['first', 'superseded'],
      ['second', 'applied'],
    ])
  })

  it('override past expires_on lists as expired and the job retires its alias', async () => {
    const actor = await staffActor(handle.db)
    const { target } = await pair()
    await createAliasOverride(
      handle.db,
      actor,
      {
        format: 'cama15',
        value: '005014000000000',
        parcelId: target,
        reason: 'temporary',
        expiresOn: '2027-05-01',
      },
      signal,
      new Date('2027-04-01T12:00:00Z'),
    )
    const [row] = await listAliasOverrides(handle.db, NOW, signal)
    expect(row?.status).toBe('expired')
    const retired = await expireAliasOverrides(handle.db, NOW, signal)
    expect(retired).toBe(1)
    const [alias] = await handle.db
      .select()
      .from(parcelAliases)
      .where(eq(parcelAliases.source, 'override'))
    expect(alias).toMatchObject({ status: 'retired', retiredReason: 'expired' })
    expect(await expireAliasOverrides(handle.db, NOW, signal)).toBe(0)
  })

  it('override on a parcel later retired by subdivision lists as no_match', async () => {
    const actor = await staffActor(handle.db)
    const { target } = await pair()
    const a = await makeParcel(handle.db, [{ format: 'gis12', value: '007014001000' }])
    const b = await makeParcel(handle.db, [{ format: 'gis12', value: '007014002000' }])
    await createAliasOverride(
      handle.db,
      actor,
      { format: 'cama15', value: '005014000000000', parcelId: target, reason: 'r' },
      signal,
      NOW,
    )
    await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'subdivision',
        effectiveDate: '2027-05-01' as CivilDate,
        effectiveBasis: 'recording',
        parents: [target],
        children: [a, b],
      },
      signal,
      NOW,
    )
    const [row] = await listAliasOverrides(handle.db, NOW, signal)
    expect(row?.status).toBe('no_match')
  })

  it('override without a reason is refused', async () => {
    const actor = await staffActor(handle.db)
    const { target } = await pair()
    const r = await createAliasOverride(
      handle.db,
      actor,
      { format: 'cama15', value: '005014000000000', parcelId: target, reason: '   ' },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'reason_required' })
  })

  it('override keyed by a display id string is rejected', async () => {
    const actor = await staffActor(handle.db)
    const r = await createAliasOverride(
      handle.db,
      actor,
      { format: 'cama15', value: '005014000000000', parcelId: '007014000000', reason: 'r' },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'invalid_parcel_id' })
  })

  it('a value that does not fit the format is refused', async () => {
    const actor = await staffActor(handle.db)
    const { target } = await pair()
    const r = await createAliasOverride(
      handle.db,
      actor,
      { format: 'cama15', value: '5014', parcelId: target, reason: 'r' },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'id_format_mismatch' })
  })

  it('reviewer gets forbidden', async () => {
    const actor = await staffActor(handle.db, 'reviewer')
    const { target } = await pair()
    const r = await createAliasOverride(
      handle.db,
      actor,
      { format: 'cama15', value: '005014000000000', parcelId: target, reason: 'r' },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
    expect(await handle.db.select().from(aliasOverrides)).toHaveLength(0)
  })

  it('next import does not overwrite an override', async () => {
    const actor = await staffActor(handle.db)
    await configureLayer(handle.db, 'parcels', PARCEL_MAPPING)
    const importer = { kind: 'user' as const, userId: actor.userId }
    const features = loadGeoJsonFixture('alder-pond-parcels.geojson')
    const run = () =>
      runImport(
        handle.db,
        importer,
        { layerKey: 'parcels', adapter: 'file_geojson', features, fullLayer: true },
        signal,
      )
    await run()
    const target = await makeParcel(handle.db, [])
    await createAliasOverride(
      handle.db,
      actor,
      { format: 'cama15', value: '007001000000000', parcelId: target, reason: 'manual fix' },
      signal,
      NOW,
    )
    const second = await run()
    expect(second.ok && second.value.exceptionsByKind.alias_conflicts_override).toBe(1)
    const exceptions = await handle.db.select().from(importExceptions)
    expect(exceptions[0]?.kind).toBe('alias_conflicts_override')
  })
})
