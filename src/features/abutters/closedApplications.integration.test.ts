import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  abutterLists,
  applicationParcels,
  applicationProfessionals,
  applications,
} from '@/db/schema'
import { addApplicantParcel, setApplicantParcels } from '@/features/abutters/applicantParcels'
import { generateList } from '@/features/abutters/lists'
import type { CoreState } from '@/features/applications/states'
import { recordDesDetermination } from '@/features/boards/des500'
import { addProfessional } from '@/features/rosters/professionals'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'

const signal = new AbortController().signal
const CLOSED = { ok: false, error: 'application_closed' }
let handle: TestDb
let world: BoardWorld
let lw: ListWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  await publishRegionalContacts(handle.db, world)
  lw = await prepareListWorld(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

async function finishAs(state: CoreState) {
  await handle.db.update(applications).set({ state }).where(eq(applications.id, lw.applicationId))
}

async function parcelsHeld() {
  const rows = await handle.db
    .select({ parcelId: applicationParcels.parcelId })
    .from(applicationParcels)
    .where(eq(applicationParcels.applicationId, lw.applicationId))
  return rows.map((r) => r.parcelId).sort()
}

describe.each<CoreState>([
  'closed',
  'denied',
  'withdrawn',
  'expired',
])('board actions on a %s application', (state) => {
  beforeEach(async () => {
    await finishAs(state)
  })

  it('refuse to draw an abutter list', async () => {
    const made = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    expect(made).toEqual(CLOSED)
    const lists = await handle.db
      .select()
      .from(abutterLists)
      .where(eq(abutterLists.applicationId, lw.applicationId))
    expect(lists).toEqual([])
  })

  it('refuse to add or replace applicant parcels', async () => {
    const before = await parcelsHeld()
    const extra = lw.ids.M6 ?? ''
    expect(
      await addApplicantParcel(
        handle.db,
        world.staff,
        { applicationId: lw.applicationId, parcelId: extra },
        signal,
      ),
    ).toEqual(CLOSED)
    expect(
      await setApplicantParcels(
        handle.db,
        world.staff,
        { applicationId: lw.applicationId, parcelIds: [extra] },
        signal,
      ),
    ).toEqual(CLOSED)
    expect(await parcelsHeld()).toEqual(before)
  })

  it('refuse to record the water body determination', async () => {
    expect(
      await recordDesDetermination(
        handle.db,
        world.staff,
        {
          applicationId: lw.applicationId,
          determination: 'not_within',
          reason: 'Surveyed and well away from water.',
        },
        signal,
        LIST_NOW,
      ),
    ).toEqual(CLOSED)
  })

  it('refuse to add a professional', async () => {
    expect(
      await addProfessional(
        handle.db,
        world.staff,
        {
          applicationId: lw.applicationId,
          name: 'Pat Surveyor',
          profession: 'land_surveyor',
          businessAddress: '1 Main St, Concord NH',
          sealOnPlat: true,
        },
        signal,
      ),
    ).toEqual(CLOSED)
    const rows = await handle.db
      .select()
      .from(applicationProfessionals)
      .where(eq(applicationProfessionals.applicationId, lw.applicationId))
    expect(rows).toEqual([])
  })
})

it('an open application still accepts a new applicant parcel', async () => {
  expect(
    await addApplicantParcel(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId, parcelId: lw.ids.M6 ?? '' },
      signal,
    ),
  ).toEqual({ ok: true, value: undefined })
})
