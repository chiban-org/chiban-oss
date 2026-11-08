import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { associationRosters, parcelAliases } from '@/db/schema'
import { upsertAssociation } from '@/features/rosters/associations'
import { readContactsQuery } from '@/features/rosters/contactListParams'
import { endRestriction } from '@/features/rosters/restrictionEnd'
import { addRestriction } from '@/features/rosters/restrictions'
import { loadRostersView } from '@/features/rosters/rosterView'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2026-12-01T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function parcel(mapLot: string, siteAddress: string): Promise<string> {
  return await makeParcel(handle.db, [{ format: 'gis12', value: mapLot }], { siteAddress })
}

async function holding(parcelId: string, holderName: string): Promise<string> {
  const added = await addRestriction(
    handle.db,
    world.staff,
    {
      parcelId,
      holderName,
      holderMailingAddress: '2 Trust Lane, Alder Pond NH',
      restrictionKind: 'conservation',
      recordedReference: 'Book 412, Page 88',
    },
    signal,
  )
  if (!added.ok) throw new Error(added.error)
  return added.value.holdingId
}

async function association(parcelId: string, name: string, asOf: string) {
  const saved = await upsertAssociation(
    handle.db,
    world.staff,
    {
      parcelId,
      associationName: name,
      officers: [{ name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105' }],
      asOf: asOf as CivilDate,
    },
    signal,
  )
  if (!saved.ok) throw new Error(saved.error)
}

async function view(raw: Record<string, string>, now = NOW) {
  const { query } = readContactsQuery(raw)
  const loaded = await loadRostersView(handle.db, world.staff, signal, { query, now })
  if (loaded === null) throw new Error('no view')
  return loaded
}

const names = (v: Awaited<ReturnType<typeof view>>) =>
  (v.list?.rows ?? []).map((r) => ('holder' in r ? r.holder : r.name))

describe('the notice contacts page loader', () => {
  it('shows 25 active holders a page and counts each kind for its tab', async () => {
    const land = await parcel('009001000000', '14 Pond Road')
    const ids: string[] = []
    for (let i = 0; i < 27; i += 1) {
      ids.push(await holding(land, `Holder ${String(i).padStart(2, '0')}`))
    }
    await endRestriction(
      handle.db,
      world.staff,
      { holdingId: ids[0] ?? '', endedOn: '2026-11-01' as CivilDate, now: NOW },
      signal,
    )
    const first = await view({ kind: 'holders' })
    expect(first.list?.tab).toBe('holders')
    expect(first.list?.rows).toHaveLength(25)
    expect(first.list?.window).toMatchObject({ total: 26, nextOffset: 25 })
    expect(names(first)[0]).toBe('Holder 01')
    expect(first.totals.holders).toMatchObject({ active: 26, ended: 1 })
    const second = await view({ kind: 'holders', cursor: '25' })
    expect(names(second)).toEqual(['Holder 26'])
    const ended = await view({ kind: 'holders', status: 'ended' })
    expect(names(ended)).toEqual(['Holder 00'])
  })

  it('finds an association by name, by parcel ID and by site address', async () => {
    await association(await parcel('009001000000', '14 Pond Road'), 'Heron Landing', '2026-10-01')
    await association(await parcel('009002000000', '3 Loon Way'), 'Loon Cove', '2026-10-01')
    expect(names(await view({ q: 'heron' }))).toEqual(['Heron Landing'])
    expect(names(await view({ q: '009002' }))).toEqual(['Loon Cove'])
    expect(names(await view({ q: 'pond road' }))).toEqual(['Heron Landing'])
    expect((await view({ q: 'nothing like it' })).list?.rows).toEqual([])
  })

  it('narrows to contacts due for a check and counts them in the header', async () => {
    await association(await parcel('009001000000', '14 Pond Road'), 'Heron Landing', '2025-01-10')
    await association(await parcel('009002000000', '3 Loon Way'), 'Loon Cove', '2026-10-01')
    await handle.db.update(associationRosters).set({ checkedOn: sql`as_of` })
    const due = await view({ due: 'yes' })
    expect(names(due)).toEqual(['Heron Landing'])
    expect(due.dueCount).toBe(1)
    expect(due.list?.counts).toMatchObject({ active: 2, due: 1 })
  })

  it('shows a linked entry even after it ended', async () => {
    const land = await parcel('009001000000', '14 Pond Road')
    const id = await holding(land, 'Alder Valley Land Trust')
    await holding(land, 'Pine River Trust')
    await endRestriction(
      handle.db,
      world.staff,
      { holdingId: id, endedOn: '2026-11-01' as CivilDate, now: NOW },
      signal,
    )
    expect(names(await view({ kind: 'holders', entry: id }))).toEqual(['Alder Valley Land Trust'])
  })

  it('lists parcels missing an association on their own tab, and falls back once none are', async () => {
    const condo = await parcel('009003000000', '7 Marsh Lane')
    await handle.db.insert(parcelAliases).values(
      ['009003000001', '009003000002'].map((value) => ({
        parcelId: condo,
        format: 'cama15',
        value,
        valueNormalized: value,
        status: 'active' as const,
        source: 'manual' as const,
      })),
    )
    const missing = await view({ kind: 'missing' })
    expect(missing.query.tab).toBe('missing')
    expect(missing.gapCount).toBe(1)
    expect(missing.gaps.rows.map((g) => g.siteAddress)).toEqual(['7 Marsh Lane'])
    expect((await view({ kind: 'missing', q: 'pond' })).gaps.rows).toEqual([])
    await association(condo, 'Marsh Lane Condominium', '2026-10-01')
    expect((await view({ kind: 'missing' })).query.tab).toBe('associations')
  })
})
