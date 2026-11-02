import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, parcelAliases, parcels } from '@/db/schema'
import { listAncestors } from '@/features/parcels/ancestors'
import { createParcelPlaceholder, getLineage, recordLineageEvent } from '@/features/parcels/lineage'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-06-01T12:00:00Z')
const d = (s: string) => s as CivilDate
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function lot(value: string): Promise<string> {
  return await makeParcel(handle.db, [{ format: 'gis12', value }])
}

describe('recordLineageEvent', () => {
  it('subdivision retires the parent on the legal date', async () => {
    const actor = await staffActor(handle.db)
    const parent = await lot('007020000000')
    const a = await lot('007020001000')
    const b = await lot('007020002000')
    const r = await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'subdivision',
        effectiveDate: d('2027-04-12'),
        effectiveBasis: 'recording',
        parents: [parent],
        children: [a, b],
      },
      signal,
      NOW,
    )
    expect(r.ok).toBe(true)
    const [row] = await handle.db.select().from(parcels).where(eq(parcels.id, parent))
    expect(row?.status).toBe('retired')
    expect(row?.retiredOn).toBe('2027-04-12')
    const via = await resolveParcelId(handle.db, { value: '007020000000' }, signal)
    expect(via).toEqual({ ok: true, value: { parcelId: parent, via: 'retired' } })
  })

  it('remainder lot that is parent and child stays active', async () => {
    const actor = await staffActor(handle.db)
    const parent = await lot('007021000000')
    const child = await lot('007021001000')
    const r = await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'subdivision',
        effectiveDate: d('2027-04-12'),
        effectiveBasis: 'approval',
        parents: [parent],
        children: [parent, child],
      },
      signal,
      NOW,
    )
    expect(r.ok).toBe(true)
    const [row] = await handle.db.select().from(parcels).where(eq(parcels.id, parent))
    expect(row?.status).toBe('active')
  })

  it('merge with one parent is invalid_shape', async () => {
    const actor = await staffActor(handle.db)
    const p = await lot('007022000000')
    const c = await lot('007022001000')
    const r = await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'merge',
        effectiveDate: d('2027-04-12'),
        effectiveBasis: 'recording',
        parents: [p],
        children: [c],
      },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'invalid_shape' })
  })

  it('effective date after today in town time zone is future_date', async () => {
    const actor = await staffActor(handle.db)
    const p = await lot('007023000000')
    const a = await lot('007023001000')
    const b = await lot('007023002000')
    const r = await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'subdivision',
        effectiveDate: d('2099-01-01'),
        effectiveBasis: 'recording',
        parents: [p],
        children: [a, b],
      },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'future_date' })
  })

  it('event creating a cycle is refused', async () => {
    const actor = await staffActor(handle.db)
    const x = await lot('007024000000')
    const a = await lot('007024001000')
    const b = await lot('007024002000')
    const base = { effectiveDate: d('2027-04-12'), effectiveBasis: 'recording' as const }
    await recordLineageEvent(
      handle.db,
      actor,
      { kind: 'subdivision', ...base, parents: [x], children: [a, b] },
      signal,
      NOW,
    )
    const r = await recordLineageEvent(
      handle.db,
      actor,
      { kind: 'merge', ...base, parents: [a, b], children: [x] },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'cycle' })
  })

  it('reviewer gets forbidden', async () => {
    const actor = await staffActor(handle.db, 'reviewer')
    const p = await lot('007025000000')
    const a = await lot('007025001000')
    const b = await lot('007025002000')
    const r = await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'subdivision',
        effectiveDate: d('2027-04-12'),
        effectiveBasis: 'recording',
        parents: [p],
        children: [a, b],
      },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })

  it('unknown parcel is refused', async () => {
    const actor = await staffActor(handle.db)
    const r = await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'subdivision',
        effectiveDate: d('2027-04-12'),
        effectiveBasis: 'recording',
        parents: ['00000000-0000-4000-8000-000000000001'],
        children: ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'],
      },
      signal,
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'unknown_parcel' })
  })

  it('event writes one audit row per retired parcel and one for the event', async () => {
    const actor = await staffActor(handle.db)
    const p1 = await lot('007026000000')
    const p2 = await lot('007026001000')
    const c = await lot('007026002000')
    const r = await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'merge',
        effectiveDate: d('2027-04-12'),
        effectiveBasis: 'recording',
        parents: [p1, p2],
        children: [c],
      },
      signal,
      NOW,
    )
    if (!r.ok) throw new Error(r.error)
    const retire = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'parcel.retire'))
    expect(retire.filter((a) => [p1, p2].includes(a.entityId))).toHaveLength(2)
    const event = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, r.value.eventId))
    expect(event).toHaveLength(1)
  })

  it('retires active aliases of retired parents with reason lineage', async () => {
    const actor = await staffActor(handle.db)
    const p = await lot('007027000000')
    const a = await lot('007027001000')
    const b = await lot('007027002000')
    await recordLineageEvent(
      handle.db,
      actor,
      {
        kind: 'subdivision',
        effectiveDate: d('2027-04-12'),
        effectiveBasis: 'recording',
        parents: [p],
        children: [a, b],
      },
      signal,
      NOW,
    )
    const [alias] = await handle.db
      .select()
      .from(parcelAliases)
      .where(eq(parcelAliases.parcelId, p))
    expect(alias?.retiredReason).toBe('lineage')
  })
})

describe('ancestry', () => {
  it('grandchild lists parent then grandparent with depth 1 and 2', async () => {
    const actor = await staffActor(handle.db)
    const gp = await lot('007030000000')
    const p = await lot('007030001000')
    const other = await lot('007030002000')
    const g = await lot('007030001001')
    const g2 = await lot('007030001002')
    const base = { effectiveDate: d('2027-04-12'), effectiveBasis: 'recording' as const }
    await recordLineageEvent(
      handle.db,
      actor,
      { kind: 'subdivision', ...base, parents: [gp], children: [p, other] },
      signal,
      NOW,
    )
    await recordLineageEvent(
      handle.db,
      actor,
      { kind: 'subdivision', ...base, parents: [p], children: [g, g2] },
      signal,
      NOW,
    )
    const anc = await listAncestors(handle.db, g, signal)
    expect(anc.map((a) => [a.parcelId, a.depth])).toEqual([
      [p, 1],
      [gp, 2],
    ])
    const lin = await getLineage(handle.db, g, signal)
    expect(lin.parents.map((x) => x.parcelId)).toEqual([p])
    expect(lin.parents[0]?.displayId).toBe('007030001000')
    expect(lin.children).toEqual([])
  })
})

describe('createParcelPlaceholder', () => {
  it('creates a parcel without geometry and with aliases', async () => {
    const actor = await staffActor(handle.db)
    const r = await createParcelPlaceholder(
      handle.db,
      actor,
      { aliases: [{ format: 'gis12', value: '007040000000' }] },
      signal,
    )
    expect(r.ok).toBe(true)
    if (r.ok) {
      const [row] = await handle.db.select().from(parcels).where(eq(parcels.id, r.value.parcelId))
      expect(row?.geom).toBeNull()
    }
  })

  it('refuses a taken alias', async () => {
    const actor = await staffActor(handle.db)
    await lot('007041000000')
    const r = await createParcelPlaceholder(
      handle.db,
      actor,
      { aliases: [{ format: 'gis12', value: '007041000000' }] },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'alias_taken' })
  })

  it('a placeholder alias must match its id format, keeping leading zeros', async () => {
    const actor = await staffActor(handle.db)
    const short = await createParcelPlaceholder(
      handle.db,
      actor,
      { aliases: [{ format: 'gis12', value: '7020' }] },
      signal,
    )
    expect(short).toEqual({ ok: false, error: 'id_format_mismatch' })
    const ok = await createParcelPlaceholder(
      handle.db,
      actor,
      { aliases: [{ format: 'gis12', value: '000000000042' }] },
      signal,
    )
    expect(ok.ok).toBe(true)
  })

  it('an unknown alias format is refused', async () => {
    const actor = await staffActor(handle.db)
    const r = await createParcelPlaceholder(
      handle.db,
      actor,
      { aliases: [{ format: 'nope', value: '1' }] },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'unknown_format' })
  })
})
