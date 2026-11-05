import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog } from '@/db/schema'
import { upsertAssociation } from '@/features/rosters/associations'
import { upsertPark } from '@/features/rosters/parks'
import { addProfessional, listProfessionals } from '@/features/rosters/professionals'
import { endRestriction } from '@/features/rosters/restrictionEnd'
import { activeRestrictions, addRestriction } from '@/features/rosters/restrictions'
import { recordRosterReview, rosterStatus } from '@/features/rosters/reviews'
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

const officer = {
  name: 'Dana Whitcomb',
  title: 'President',
  mailingAddress: 'PO Box 105, Alder Pond NH 03999',
}

describe('roster review status', () => {
  it('roster never reviewed reports never_reviewed', async () => {
    expect(await rosterStatus(handle.db, 'condo', d('2027-03-03'), signal)).toEqual({
      state: 'never_reviewed',
      reviewedOn: null,
      ageDays: null,
    })
  })

  it('review on 2027-02-01 reports age 30 on 2027-03-03', async () => {
    await recordRosterReview(
      handle.db,
      world.staff,
      { kind: 'condo', reviewedOn: d('2027-02-01') },
      signal,
    )
    expect(await rosterStatus(handle.db, 'condo', d('2027-03-03'), signal)).toEqual({
      state: 'reviewed',
      reviewedOn: '2027-02-01',
      ageDays: 30,
    })
  })

  it('the latest review counts and other kinds are unaffected', async () => {
    await recordRosterReview(
      handle.db,
      world.staff,
      { kind: 'condo', reviewedOn: d('2027-02-01') },
      signal,
    )
    await recordRosterReview(
      handle.db,
      world.staff,
      { kind: 'condo', reviewedOn: d('2027-02-20') },
      signal,
    )
    expect((await rosterStatus(handle.db, 'condo', d('2027-03-03'), signal)).ageDays).toBe(11)
    expect((await rosterStatus(handle.db, 'park', d('2027-03-03'), signal)).state).toBe(
      'never_reviewed',
    )
  })

  it('reviewer recording a review is forbidden', async () => {
    expect(
      await recordRosterReview(
        handle.db,
        world.reviewer,
        { kind: 'condo', reviewedOn: d('2027-02-01') },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('association rosters', () => {
  it('association with no officers is refused', async () => {
    const result = await upsertAssociation(
      handle.db,
      world.staff,
      { parcelId, associationName: 'Pond View Condominium', officers: [], asOf: d('2027-02-01') },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'officers_required' })
  })

  it('an officer without a mailing address is refused', async () => {
    const result = await upsertAssociation(
      handle.db,
      world.staff,
      {
        parcelId,
        associationName: 'Pond View Condominium',
        officers: [{ ...officer, mailingAddress: ' ' }],
        asOf: d('2027-02-01'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'officers_required' })
  })

  it('upserting twice keeps one roster for the parcel', async () => {
    for (const asOf of ['2027-02-01', '2027-02-10']) {
      const result = await upsertAssociation(
        handle.db,
        world.staff,
        {
          parcelId,
          associationName: 'Pond View Condominium',
          officers: [officer],
          asOf: d(asOf),
        },
        signal,
      )
      expect(result.ok).toBe(true)
    }
    const rows = await handle.db.query.associationRosters.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.asOf).toBe('2027-02-10')
  })

  it('reviewer editing a roster is forbidden', async () => {
    const result = await upsertAssociation(
      handle.db,
      world.reviewer,
      {
        parcelId,
        associationName: 'Pond View Condominium',
        officers: [officer],
        asOf: d('2027-02-01'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
    expect(await handle.db.query.associationRosters.findMany()).toHaveLength(0)
  })
})

describe('park rosters', () => {
  const park = {
    parkName: 'Heron Park',
    ownerName: 'Heron Park LLC',
    ownerMailingAddress: '1 Heron Road, Alder Pond NH',
    asOf: d('2027-02-01'),
  }

  it('a park needs at least one tenant', async () => {
    const result = await upsertPark(
      handle.db,
      world.staff,
      { parcelId, ...park, tenants: [] },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'tenants_required' })
  })

  it('tenants keep their ids', async () => {
    const tenant = {
      tenantId: 'site-4',
      name: 'Lee Marsh',
      mailingAddress: '4 Heron Road, Alder Pond NH',
      siteLabel: 'Site 4',
    }
    const result = await upsertPark(
      handle.db,
      world.staff,
      { parcelId, ...park, tenants: [tenant] },
      signal,
    )
    expect(result.ok).toBe(true)
    const [row] = await handle.db.query.parkRosters.findMany()
    expect(row?.tenants).toEqual([tenant])
  })
})

describe('restrictions', () => {
  const holding = {
    holderName: 'Alder Valley Land Trust',
    holderMailingAddress: '2 Trust Lane, Alder Pond NH',
    restrictionKind: 'conservation' as const,
    recordedReference: 'Book 12, Page 40',
  }

  it('ended restriction is not active', async () => {
    const added = await addRestriction(handle.db, world.staff, { parcelId, ...holding }, signal)
    if (!added.ok) throw new Error('add failed')
    expect(await activeRestrictions(handle.db, [parcelId], d('2027-03-03'), signal)).toHaveLength(1)
    await endRestriction(
      handle.db,
      world.staff,
      { holdingId: added.value.holdingId, endedOn: d('2027-03-01') },
      signal,
    )
    expect(await activeRestrictions(handle.db, [parcelId], d('2027-03-03'), signal)).toHaveLength(0)
    expect(await activeRestrictions(handle.db, [parcelId], d('2027-02-20'), signal)).toHaveLength(1)
  })

  it('a restriction without a holder address is refused', async () => {
    const result = await addRestriction(
      handle.db,
      world.staff,
      { parcelId, ...holding, holderMailingAddress: '' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'address_required' })
  })

  it('reviewer adding a restriction is forbidden', async () => {
    expect(
      await addRestriction(handle.db, world.reviewer, { parcelId, ...holding }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })
})
