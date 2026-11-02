import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, parcelAliases } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { addAlias } from '@/features/parcels/aliases'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { makeParcel, seedFormats } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedFormats(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('resolveParcelId', () => {
  it('three cama aliases resolve to one condo parcel', async () => {
    const id = await makeParcel(handle.db, [
      { format: 'gis12', value: '007014000000' },
      { format: 'cama15', value: '007014000000001' },
      { format: 'cama15', value: '007014000000002' },
      { format: 'cama15', value: '007014000000003' },
    ])
    for (const value of ['007014000000001', '007014000000002', '007014000000003']) {
      const r = await resolveParcelId(handle.db, { format: 'cama15', value }, signal)
      expect(r).toEqual({ ok: true, value: { parcelId: id, via: 'active' } })
    }
  })

  it('retired id still resolves', async () => {
    const id = await makeParcel(handle.db, [
      { format: 'gis12', value: '007020000000', status: 'retired' },
    ])
    const r = await resolveParcelId(handle.db, { value: '007-020-000-000' }, signal)
    expect(r).toEqual({ ok: true, value: { parcelId: id, via: 'retired' } })
  })

  it('active alias beats a reused retired value', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '007031000000', status: 'retired' }])
    const live = await makeParcel(handle.db, [{ format: 'gis12', value: '007031000000' }])
    const r = await resolveParcelId(handle.db, { format: 'gis12', value: '007031000000' }, signal)
    expect(r).toEqual({ ok: true, value: { parcelId: live, via: 'active' } })
  })

  it('two retired candidates are ambiguous', async () => {
    const a = await makeParcel(handle.db, [
      { format: 'gis12', value: '007032000000', status: 'retired' },
    ])
    const b = await makeParcel(handle.db, [
      { format: 'gis12', value: '007032000000', status: 'retired' },
    ])
    const r = await resolveParcelId(handle.db, { value: '007032000000' }, signal)
    expect(r.ok).toBe(false)
    if (!r.ok && r.error !== 'not_found') expect(r.error.ambiguous.sort()).toEqual([a, b].sort())
  })

  it('unknown id is not_found', async () => {
    const r = await resolveParcelId(handle.db, { value: '999999999999' }, signal)
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('addAlias', () => {
  it('alias insert writes an audit row with the acting user', async () => {
    const userId = await makeUser(handle.db, { role: 'staff' })
    const actor = await loadActor(handle.db, userId, signal)
    if (actor === null) throw new Error('actor')
    const parcelId = await makeParcel(handle.db, [])
    const r = await handle.db.transaction((tx) =>
      addAlias(
        tx,
        { parcelId, format: 'gis12', value: '007040000000', source: 'manual' },
        actor,
        signal,
      ),
    )
    expect(r.ok).toBe(true)
    const audit = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, parcelId))
    expect(audit).toHaveLength(1)
    expect(audit[0]?.actorUserId).toBe(userId)
  })

  it('refuses a value already active on another parcel', async () => {
    const userId = await makeUser(handle.db, { role: 'staff' })
    const actor = await loadActor(handle.db, userId, signal)
    if (actor === null) throw new Error('actor')
    await makeParcel(handle.db, [{ format: 'gis12', value: '007041000000' }])
    const other = await makeParcel(handle.db, [])
    const r = await handle.db.transaction((tx) =>
      addAlias(
        tx,
        { parcelId: other, format: 'gis12', value: '007041000000', source: 'manual' },
        actor,
        signal,
      ),
    )
    expect(r).toEqual({ ok: false, error: 'alias_taken' })
    const rows = await handle.db
      .select()
      .from(parcelAliases)
      .where(eq(parcelAliases.parcelId, other))
    expect(rows).toHaveLength(0)
  })
})
