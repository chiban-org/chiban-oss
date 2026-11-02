import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog } from '@/db/schema'
import { upsertAssociation } from '@/features/rosters/associations'
import { upsertPark } from '@/features/rosters/parks'
import { addProfessional, listProfessionals } from '@/features/rosters/professionals'
import { activeRestrictions, addRestriction, endRestriction } from '@/features/rosters/restrictions'
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

describe('application professionals', () => {
  const surveyor = {
    name: 'Rae Fenn',
    profession: 'land_surveyor' as const,
    businessAddress: '8 Survey Row, Alder Pond NH',
    sealOnPlat: true,
  }

  it('professional without business address is refused', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      '2027-03-24',
    )
    const result = await addProfessional(
      handle.db,
      world.staff,
      { applicationId, ...surveyor, businessAddress: ' ' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'address_required' })
  })

  it('a professional is listed for the application', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      '2027-03-24',
    )
    await addProfessional(handle.db, world.staff, { applicationId, ...surveyor }, signal)
    const listed = await listProfessionals(handle.db, world.staff, applicationId, signal)
    expect(listed.ok && listed.value.map((p) => p.name)).toEqual(['Rae Fenn'])
  })

  it('reviewer cannot add or list professionals', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      '2027-03-24',
    )
    expect(
      await addProfessional(handle.db, world.reviewer, { applicationId, ...surveyor }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(await listProfessionals(handle.db, world.reviewer, applicationId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('audit', () => {
  it('every roster change writes an audit row', async () => {
    await upsertAssociation(
      handle.db,
      world.staff,
      {
        parcelId,
        associationName: 'Pond View Condominium',
        officers: [officer],
        asOf: d('2027-02-01'),
      },
      signal,
    )
    await upsertPark(
      handle.db,
      world.staff,
      {
        parcelId: await makeParcel(handle.db, [{ format: 'gis12', value: '009002000000' }]),
        parkName: 'Heron Park',
        ownerName: 'Heron Park LLC',
        ownerMailingAddress: '1 Heron Road',
        tenants: [
          {
            tenantId: 's1',
            name: 'Lee Marsh',
            mailingAddress: '4 Heron Road',
            siteLabel: 'Site 4',
          },
        ],
        asOf: d('2027-02-01'),
      },
      signal,
    )
    const added = await addRestriction(
      handle.db,
      world.staff,
      {
        parcelId,
        holderName: 'Land Trust',
        holderMailingAddress: '2 Trust Lane',
        restrictionKind: 'conservation',
        recordedReference: 'Book 1',
      },
      signal,
    )
    if (!added.ok) throw new Error('add failed')
    await endRestriction(
      handle.db,
      world.staff,
      { holdingId: added.value.holdingId, endedOn: d('2027-03-01') },
      signal,
    )
    await recordRosterReview(
      handle.db,
      world.staff,
      { kind: 'park', reviewedOn: d('2027-03-01') },
      signal,
    )
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      '2027-03-24',
    )
    await addProfessional(
      handle.db,
      world.staff,
      {
        applicationId,
        name: 'Rae Fenn',
        profession: 'engineer',
        businessAddress: '8 Survey Row',
        sealOnPlat: true,
      },
      signal,
    )
    const actions = (
      await handle.db.select().from(auditLog).where(eq(auditLog.actorUserId, world.staff.userId))
    ).map((r) => r.action)
    for (const action of [
      'roster.association.upsert',
      'roster.park.upsert',
      'roster.restriction.add',
      'roster.restriction.end',
      'roster.review.record',
      'roster.professional.add',
    ]) {
      expect(actions, action).toContain(action)
    }
  })
})
