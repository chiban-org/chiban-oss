import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordLineageEvent } from '@/features/parcels/lineage'
import { getParcelHistory } from '@/features/parcels/parcelHistory'
import { carryForward, linkRecordToParcel } from '@/features/parcels/recordLinks'
import {
  type ParcelRecordSummary,
  parcelRecordSources,
  registerParcelRecordSource,
} from '@/features/parcels/recordSources'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-06-01T12:00:00Z')
const hidden = new Set<string>()
let handle: TestDb

function summary(recordId: string): ParcelRecordSummary {
  return {
    kind: 'test_record',
    recordId,
    title: `Record ${recordId.slice(0, 4)}`,
    number: null,
    status: { label: 'Open', chip: 'neutral' },
    date: null,
    href: `/records/${recordId}`,
  }
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  registerParcelRecordSource({
    kind: 'test_record',
    summarize: (_db, ids, viewer) =>
      Promise.resolve(ids.filter((id) => viewer.kind !== 'public' || !hidden.has(id)).map(summary)),
  })
})
afterAll(async () => {
  await handle.drop()
})

async function link(parcelId: string): Promise<{ linkId: string; recordId: string }> {
  const recordId = randomUUID()
  const linkId = await handle.db.transaction((tx) =>
    linkRecordToParcel(tx, { recordKind: 'test_record', recordId, parcelId }, signal),
  )
  return { linkId, recordId }
}

async function subdivide(parent: string, a: string, b: string) {
  const actor = await staffActor(handle.db)
  await recordLineageEvent(
    handle.db,
    actor,
    {
      kind: 'subdivision',
      effectiveDate: '2027-04-12' as CivilDate,
      effectiveBasis: 'recording',
      parents: [parent],
      children: [a, b],
    },
    signal,
    NOW,
  )
  return actor
}

const staffViewer = async () => ({ kind: 'actor' as const, actor: await staffActor(handle.db) })

describe('getParcelHistory', () => {
  it('ancestral label reads from parent lot before the year and kind', async () => {
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007020000000' }])
    const a = await makeParcel(handle.db, [{ format: 'gis12', value: '007020001000' }])
    const b = await makeParcel(handle.db, [{ format: 'gis12', value: '007020002000' }])
    await subdivide(p, a, b)
    await link(p)
    const h = await getParcelHistory(handle.db, a, await staffViewer(), signal)
    expect(h.own).toEqual([])
    expect(h.ancestral[0]?.label).toBe('from parent lot 007020000000, before the 2027 subdivision')
    expect(h.ancestral[0]?.records).toHaveLength(1)
    expect(h.sourcesRegistered).toBe(parcelRecordSources().length)
  })

  it('own records come before ancestral records', async () => {
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007021000000' }])
    const a = await makeParcel(handle.db, [{ format: 'gis12', value: '007021001000' }])
    const b = await makeParcel(handle.db, [{ format: 'gis12', value: '007021002000' }])
    await subdivide(p, a, b)
    const parentRecord = await link(p)
    const ownRecord = await link(a)
    const h = await getParcelHistory(handle.db, a, await staffViewer(), signal)
    expect(h.own.map((r) => r.recordId)).toEqual([ownRecord.recordId])
    expect(h.ancestral[0]?.records.map((r) => r.recordId)).toEqual([parentRecord.recordId])
  })

  it('carried-forward record moves to own on the named child only', async () => {
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007022000000' }])
    const a = await makeParcel(handle.db, [{ format: 'gis12', value: '007022001000' }])
    const b = await makeParcel(handle.db, [{ format: 'gis12', value: '007022002000' }])
    const actor = await subdivide(p, a, b)
    const rec = await link(p)
    await carryForward(handle.db, actor, { linkId: rec.linkId, toParcelId: a }, signal)
    const viewer = await staffViewer()
    const ha = await getParcelHistory(handle.db, a, viewer, signal)
    expect(ha.own[0]?.recordId).toBe(rec.recordId)
    expect(ha.own[0]?.carriedFrom).toEqual({ parcelId: p, displayId: '007022000000' })
    expect(ha.ancestral.flatMap((g) => g.records)).toEqual([])
    const hb = await getParcelHistory(handle.db, b, viewer, signal)
    expect(hb.own).toEqual([])
    expect(hb.ancestral[0]?.records[0]?.recordId).toBe(rec.recordId)
  })

  it('public viewer receives only rows the source allows', async () => {
    const p = await makeParcel(handle.db, [{ format: 'gis12', value: '007023000000' }])
    const r1 = await link(p)
    await link(p)
    await link(p)
    hidden.add(r1.recordId)
    const h = await getParcelHistory(handle.db, p, { kind: 'public' }, signal)
    expect(h.own).toHaveLength(2)
  })
})
