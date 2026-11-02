import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  correctRecipient,
  decideTenant,
  excludeCandidate,
  generateList,
} from '@/features/abutters/lists'
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

describe('drawing the list again', () => {
  it('keeps the parcels staff left off and the addresses staff corrected', async () => {
    const first = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    if (!first.ok) throw new Error('generate')
    const candidates = await handle.db.query.abutterListCandidates.findMany({
      where: (c, { eq }) => eq(c.listId, first.value.listId),
    })
    const leftOff = candidates[0]?.parcelId ?? ''
    await excludeCandidate(
      handle.db,
      world.staff,
      { listId: first.value.listId, parcelId: leftOff, reason: 'Common land owned by the town' },
      signal,
      LIST_NOW,
    )
    const rows = await handle.db.query.abutterListRecipients.findMany({
      where: (r, { eq }) => eq(r.listId, first.value.listId),
    })
    const owner = rows.find(
      (r) => !r.excluded && (r.data as { roles: string[] }).roles.includes('abutter_owner'),
    )
    await correctRecipient(
      handle.db,
      world.staff,
      {
        listId: first.value.listId,
        recipientId: owner?.id ?? '',
        name: 'Wren Holdings',
        mailingAddress: '3 Wren Way, Alder Pond NH 03999',
        reason: 'Owner wrote with a new address',
      },
      signal,
      LIST_NOW,
    )
    const second = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    if (!second.ok) throw new Error('generate')
    const redrawn = await handle.db.query.abutterListCandidates.findMany({
      where: (c, { eq }) => eq(c.listId, second.value.listId),
    })
    expect(redrawn.find((c) => c.parcelId === leftOff)).toMatchObject({
      excluded: true,
      exclusionReason: 'Common land owned by the town',
    })
    const recipients = await handle.db.query.abutterListRecipients.findMany({
      where: (r, { eq }) => eq(r.listId, second.value.listId),
    })
    expect(recipients.map((r) => (r.data as { mailingAddress: string }).mailingAddress)).toContain(
      '3 Wren Way, Alder Pond NH 03999',
    )
  })
})
