import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parcelRecordLinks } from '@/db/schema'
import { createParcelPlaceholder, recordLineageEvent } from '@/features/parcels/lineage'
import {
  carryForward,
  linkRecordByRawRef,
  linkRecordToParcel,
  resolveUnresolvedLink,
  retryUnresolvedLinks,
} from '@/features/parcels/recordLinks'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-06-01T12:00:00Z')
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function linkRow(id: string) {
  const [row] = await handle.db.select().from(parcelRecordLinks).where(eq(parcelRecordLinks.id, id))
  return row
}

describe('linking records', () => {
  it('direct link is stored linked', async () => {
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007100000000' }])
    const recordId = randomUUID()
    await handle.db.transaction((tx) =>
      linkRecordToParcel(tx, { recordKind: 'test_record', recordId, parcelId: p }, signal),
    )
    const rows = await handle.db
      .select()
      .from(parcelRecordLinks)
      .where(eq(parcelRecordLinks.recordId, recordId))
    expect(rows[0]).toMatchObject({ status: 'linked', linkedVia: 'direct', parcelId: p })
  })

  it('raw ref to a retired id links via retired_alias', async () => {
    const p = await makeParcel(handle.db, [
      { format: 'gis12', value: '007101000000', status: 'retired' },
    ])
    const recordId = randomUUID()
    const r = await handle.db.transaction((tx) =>
      linkRecordByRawRef(
        tx,
        { recordKind: 'test_record', recordId, value: '007101000000' },
        signal,
      ),
    )
    expect(r.status).toBe('linked')
    expect(await linkRow(r.linkId)).toMatchObject({ linkedVia: 'retired_alias', parcelId: p })
  })

  it('unknown raw ref is unresolved, then resolves after the parcel exists and retry runs', async () => {
    const actor = await staffActor(handle.db)
    const recordId = randomUUID()
    const r = await handle.db.transaction((tx) =>
      linkRecordByRawRef(
        tx,
        { recordKind: 'test_record', recordId, format: 'gis12', value: '008099000000' },
        signal,
      ),
    )
    expect(r.status).toBe('unresolved')
    expect((await linkRow(r.linkId))?.parcelId).toBeNull()
    const created = await createParcelPlaceholder(
      handle.db,
      actor,
      { aliases: [{ format: 'gis12', value: '008099000000' }] },
      signal,
    )
    if (!created.ok) throw new Error('placeholder')
    const retried = await retryUnresolvedLinks(handle.db, signal)
    expect(retried.resolved).toBeGreaterThanOrEqual(1)
    expect(await linkRow(r.linkId)).toMatchObject({
      status: 'linked',
      parcelId: created.value.parcelId,
      linkedVia: 'direct',
    })
  })

  it('staff resolves an unresolved link manually; reviewer cannot', async () => {
    const recordId = randomUUID()
    const r = await handle.db.transaction((tx) =>
      linkRecordByRawRef(
        tx,
        { recordKind: 'test_record', recordId, value: '009000000000' },
        signal,
      ),
    )
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007102000000' }])
    const reviewer = await staffActor(handle.db, 'reviewer')
    expect(await resolveUnresolvedLink(handle.db, reviewer, r.linkId, p, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const staff = await staffActor(handle.db)
    expect((await resolveUnresolvedLink(handle.db, staff, r.linkId, p, signal)).ok).toBe(true)
    expect(await linkRow(r.linkId)).toMatchObject({ linkedVia: 'manual_resolution', parcelId: p })
    expect(await resolveUnresolvedLink(handle.db, staff, r.linkId, p, signal)).toEqual({
      ok: false,
      error: 'not_unresolved',
    })
  })
})

describe('carryForward', () => {
  it('carry forward to a non-descendant is refused', async () => {
    const actor = await staffActor(handle.db)
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007103000000' }])
    const stranger = await makeParcel(handle.db, [{ format: 'gis12', value: '007104000000' }])
    const recordId = randomUUID()
    const link = await handle.db.transaction((tx) =>
      linkRecordToParcel(tx, { recordKind: 'test_record', recordId, parcelId: p }, signal),
    )
    const r = await carryForward(handle.db, actor, { linkId: link, toParcelId: stranger }, signal)
    expect(r).toEqual({ ok: false, error: 'not_a_descendant' })
  })

  it('carry forward to a child succeeds', async () => {
    const actor = await staffActor(handle.db)
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007105000000' }])
    const a = await makeParcel(handle.db, [{ format: 'gis12', value: '007105001000' }])
    const b = await makeParcel(handle.db, [{ format: 'gis12', value: '007105002000' }])
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
    const link = await handle.db.transaction((tx) =>
      linkRecordToParcel(
        tx,
        { recordKind: 'test_record', recordId: randomUUID(), parcelId: p },
        signal,
      ),
    )
    const r = await carryForward(handle.db, actor, { linkId: link, toParcelId: a }, signal)
    expect(r.ok).toBe(true)
  })
})
