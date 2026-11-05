import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterLists, auditLog, parcelAliases } from '@/db/schema'
import { upsertAssociation } from '@/features/rosters/associations'
import { confirmEntry } from '@/features/rosters/confirm'
import { condoGaps } from '@/features/rosters/gaps'
import { loadParcelContacts } from '@/features/rosters/parcelContacts'
import { upsertPark } from '@/features/rosters/parks'
import { endRestriction, undoRestrictionEnd } from '@/features/rosters/restrictionEnd'
import { addRestriction } from '@/features/rosters/restrictions'
import { loadRostersView } from '@/features/rosters/rosterView'
import { earlierVersions } from '@/features/rosters/versions'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld
let parcelId: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '009001000000' }])
})
afterEach(async () => {
  await handle.drop()
})

const dana = {
  name: 'Dana Whitcomb',
  title: 'President',
  mailingAddress: 'PO Box 105, Alder Pond NH',
}
const lee = { name: 'Lee Marsh', title: 'Treasurer', mailingAddress: 'PO Box 106, Alder Pond NH' }

async function association(officers = [dana]): Promise<string> {
  const saved = await upsertAssociation(
    handle.db,
    world.staff,
    { parcelId, associationName: 'Pond View Condominium', officers, asOf: d('2026-01-10') },
    signal,
  )
  if (!saved.ok) throw new Error(saved.error)
  return (await handle.db.query.associationRosters.findFirst())?.id ?? ''
}

async function holding(): Promise<string> {
  const added = await addRestriction(
    handle.db,
    world.staff,
    {
      parcelId,
      holderName: 'Alder Valley Land Trust',
      holderMailingAddress: '2 Trust Lane, Alder Pond NH',
      restrictionKind: 'conservation',
      recordedReference: 'Book 412, Page 88',
    },
    signal,
  )
  if (!added.ok) throw new Error(added.error)
  return added.value.holdingId
}

describe('confirm still correct', () => {
  it('sets the checked date without changing what is on file', async () => {
    const id = await association()
    const now = new Date('2026-12-01T16:00:00Z')
    const confirmed = await confirmEntry(
      handle.db,
      world.staff,
      { kind: 'association', entryId: id, now },
      signal,
    )
    expect(confirmed).toEqual({ ok: true, value: { checkedOn: '2026-12-01' } })
    const row = await handle.db.query.associationRosters.findFirst()
    expect(row).toMatchObject({ checkedOn: '2026-12-01', asOf: '2026-01-10', officers: [dana] })
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'roster.association.confirm'))
    expect(audit[0]?.after).toEqual({ entryId: id, checkedOn: '2026-12-01' })
  })

  it('is refused for someone who cannot keep notice contacts', async () => {
    const id = await association()
    expect(
      await confirmEntry(handle.db, world.reviewer, { kind: 'association', entryId: id }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('earlier versions', () => {
  it('keeps every officer and address an edit replaced', async () => {
    await association()
    await association([lee])
    const versions = await earlierVersions(handle.db, {
      kind: 'association',
      parcelIds: [parcelId],
      timeZone: 'America/New_York',
    })
    const kept = versions.get(parcelId) ?? []
    expect(kept).toHaveLength(1)
    expect(kept[0]?.lines).toEqual([
      'Pond View Condominium',
      'Dana Whitcomb, President, PO Box 105, Alder Pond NH',
      'List dated January 10, 2026',
    ])
    expect(kept[0]?.changedText).toMatch(/^Replaced .+ by /)
  })

  it('keeps the park owner and tenants an edit replaced', async () => {
    const park = {
      parcelId,
      parkName: 'Heron Park',
      ownerName: 'Heron Park LLC',
      ownerMailingAddress: '1 Heron Road, Alder Pond NH',
      tenants: [
        {
          tenantId: 'site-4',
          name: 'Cass Pryor',
          mailingAddress: '4 Heron Road',
          siteLabel: 'Site 4',
        },
      ],
      asOf: d('2026-01-10'),
    }
    await upsertPark(handle.db, world.staff, park, signal)
    await upsertPark(handle.db, world.staff, { ...park, ownerName: 'Heron Holdings' }, signal)
    const versions = await earlierVersions(handle.db, {
      kind: 'park',
      parcelIds: [parcelId],
      timeZone: 'America/New_York',
    })
    expect(versions.get(parcelId)?.[0]?.lines).toEqual([
      'Heron Park',
      'Owner: Heron Park LLC, 1 Heron Road, Alder Pond NH',
      'Cass Pryor, Site 4, 4 Heron Road',
      'List dated January 10, 2026',
    ])
  })
})

describe('gaps', () => {
  async function units(id: string, values: string[]) {
    await handle.db.insert(parcelAliases).values(
      values.map((value) => ({
        parcelId: id,
        format: 'cama15',
        value,
        valueNormalized: value,
        status: 'active' as const,
        source: 'manual' as const,
      })),
    )
  }

  it('lists a multi-unit parcel with no association, and drops it once one is added', async () => {
    const single = await makeParcel(handle.db, [{ format: 'gis12', value: '009002000000' }])
    await units(parcelId, ['009001000001', '009001000002'])
    await units(single, ['009002000001'])
    expect((await condoGaps(handle.db, signal)).map((g) => [g.parcelId, g.units])).toEqual([
      [parcelId, 2],
    ])
    await association()
    expect(await condoGaps(handle.db, signal)).toEqual([])
  })
})

describe('ending a restriction', () => {
  it('ends on the chosen date and can be undone while no list has used the ending', async () => {
    const id = await holding()
    expect(
      (
        await endRestriction(
          handle.db,
          world.staff,
          { holdingId: id, endedOn: d('2026-12-31') },
          signal,
        )
      ).ok,
    ).toBe(true)
    expect((await handle.db.query.restrictionHoldings.findFirst())?.endedOn).toBe('2026-12-31')
    expect(await undoRestrictionEnd(handle.db, world.staff, { holdingId: id }, signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect((await handle.db.query.restrictionHoldings.findFirst())?.endedOn).toBeNull()
  })

  it('cannot be undone once a list for that land was issued after the ending', async () => {
    const id = await holding()
    await endRestriction(
      handle.db,
      world.staff,
      { holdingId: id, endedOn: d('2026-11-01') },
      signal,
    )
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      '2027-03-24',
    )
    await handle.db.insert(abutterLists).values({
      applicationId,
      version: 1,
      status: 'issued',
      strategyKey: 'nh.abutters.adjacency_projection',
      strategyVersion: 1,
      resolverKey: 'nh.recipients.v1',
      resolverVersion: 1,
      drawnOn: '2026-11-04',
      layers: {},
      incomplete: { strategy: [], resolver: [] },
      issuedBy: world.staff.userId,
      issuedAt: new Date(Date.now() + 60_000),
      snapshot: { applicantParcelIds: [parcelId], recipients: [] },
      createdBy: world.staff.userId,
    })
    expect(await undoRestrictionEnd(handle.db, world.staff, { holdingId: id }, signal)).toEqual({
      ok: false,
      error: 'ending_used',
    })
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'roster.restriction.end'), eq(auditLog.entityId, parcelId)))
    expect(audit[0]?.after).toEqual({ holdingId: id, endedOn: '2026-11-01' })
  })

  it('undo is refused for someone who cannot keep notice contacts', async () => {
    const id = await holding()
    await endRestriction(
      handle.db,
      world.staff,
      { holdingId: id, endedOn: d('2026-11-01') },
      signal,
    )
    expect(await undoRestrictionEnd(handle.db, world.reviewer, { holdingId: id }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('the parcel card', () => {
  it('shows who gets notice for that parcel only, with nothing from other parcels', async () => {
    await association()
    await holding()
    const other = await makeParcel(handle.db, [{ format: 'gis12', value: '009003000000' }])
    await upsertPark(
      handle.db,
      world.staff,
      {
        parcelId: other,
        parkName: 'Heron Park',
        ownerName: 'Heron Park LLC',
        ownerMailingAddress: '1 Heron Road, Alder Pond NH',
        tenants: [
          { tenantId: 's4', name: 'Cass Pryor', mailingAddress: '4 Heron', siteLabel: '4' },
        ],
        asOf: d('2026-01-10'),
      },
      signal,
    )
    const card = await loadParcelContacts(handle.db, world.staff, { parcelId }, signal)
    expect(card?.associations.map((a) => a.officers)).toEqual([[dana]])
    expect(card?.restrictions.map((r) => r.holderMailingAddress)).toEqual([
      '2 Trust Lane, Alder Pond NH',
    ])
    expect(card?.parks).toEqual([])
    expect(card?.empty).toBe(false)
    expect(await loadParcelContacts(handle.db, world.reviewer, { parcelId }, signal)).toBeNull()
  })

  it('says a multi-unit parcel has no association on file', async () => {
    await handle.db.insert(parcelAliases).values(
      ['009001000001', '009001000002'].map((value) => ({
        parcelId,
        format: 'cama15',
        value,
        valueNormalized: value,
        status: 'active' as const,
        source: 'manual' as const,
      })),
    )
    const card = await loadParcelContacts(handle.db, world.staff, { parcelId }, signal)
    expect(card?.missingAssociation).toEqual({ units: 2 })
    expect(card?.empty).toBe(false)
  })
})

describe('the notice contacts page', () => {
  it('counts what is due for a check and stays quiet about entries still fresh', async () => {
    await association()
    await holding()
    const now = new Date('2026-03-01T16:00:00Z')
    const fresh = await loadRostersView(handle.db, world.staff, signal, now)
    expect(fresh?.dueCount).toBe(0)
    const later = await loadRostersView(
      handle.db,
      world.staff,
      signal,
      new Date('2028-06-01T16:00:00Z'),
    )
    expect(later?.dueCount).toBe(2)
    expect(later?.associations[0]?.due).toBe(true)
    expect(later?.recheckDays).toBe(365)
    expect(await loadRostersView(handle.db, world.reviewer, signal)).toBeNull()
  })
})
