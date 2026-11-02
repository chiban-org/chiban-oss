import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decideTenant, generateList } from '@/features/abutters/lists'
import { loadListView } from '@/features/abutters/listView'
import { upsertPark } from '@/features/rosters/parks'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
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

describe('a decided park tenant', () => {
  it('no longer reads as needing a decision', async () => {
    await upsertPark(
      handle.db,
      world.staff,
      {
        parcelId: lw.ids.SW ?? '',
        parkName: 'Heron Park',
        ownerName: 'Heron Park LLC',
        ownerMailingAddress: '1 Heron Road, Alder Pond NH',
        tenants: [
          {
            tenantId: 's4',
            name: 'Lee Marsh',
            mailingAddress: '4 Heron Road',
            siteLabel: 'Site 4',
          },
        ],
        asOf: '2027-02-01' as CivilDate,
      },
      signal,
    )
    const made = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    if (!made.ok) throw new Error('generate')
    const tenant = (await handle.db.query.abutterListRecipients.findMany()).find(
      (r) => (r.data as { name: string }).name === 'Lee Marsh',
    )
    await decideTenant(
      handle.db,
      world.staff,
      {
        listId: made.value.listId,
        recipientId: tenant?.id ?? '',
        qualifies: true,
        reason: 'Roster shows unit 4 adjoins the lot',
      },
      signal,
      LIST_NOW,
    )
    const view = await loadListView(handle.db, world.staff, made.value.listId, signal)
    const row = view?.recipients.find((r) => r.name === 'Lee Marsh')
    expect(row).toMatchObject({
      statusText: 'Decided by staff',
      needsDecision: false,
      decisionText: 'Counts as an abutter: Roster shows unit 4 adjoins the lot',
    })
  })
})
