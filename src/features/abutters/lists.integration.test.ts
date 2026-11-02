import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { abutterLists, remediationTasks } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import {
  attestCrossings,
  correctRecipient,
  decideTenant,
  excludeCandidate,
  generateList,
  selectParcel,
} from '@/features/abutters/lists'
import { currentIssuedList } from '@/features/abutters/queries'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { upsertPark } from '@/features/rosters/parks'
import { addProfessional } from '@/features/rosters/professionals'
import { type BoardWorld, publishRegionalContacts, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { expectDbError } from '@/test/dbErrors'
import { LIST_NOW, type ListWorld, prepareListWorld } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
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

async function generate(now = LIST_NOW) {
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    now,
  )
  if (!made.ok) throw new Error(`generate failed: ${JSON.stringify(made.error)}`)
  return made.value
}

async function issue(listId: string) {
  return await issueList(handle.db, world.staff, { listId }, signal, LIST_NOW)
}

describe('draft lists', () => {
  it('generates a draft with candidates, recipients, and the day it was drawn', async () => {
    const { listId, version } = await generate()
    expect(version).toBe(1)
    const [row] = await handle.db.select().from(abutterLists).where(eq(abutterLists.id, listId))
    expect(row).toMatchObject({
      status: 'draft',
      drawnOn: '2027-03-24',
      strategyKey: 'nh.abutters.adjacency_projection',
    })
    const candidates = await handle.db.query.abutterListCandidates.findMany()
    expect(candidates).toHaveLength(8)
    const recipients = await handle.db.query.abutterListRecipients.findMany()
    expect(recipients).toHaveLength(9)
  })

  it('regenerate creates version 2 and leaves version 1 issued until 2 issues', async () => {
    const first = await generate()
    expect((await issue(first.listId)).ok).toBe(true)
    const second = await generate()
    expect(second.version).toBe(2)
    expect((await currentIssuedList(handle.db, lw.applicationId, signal))?.version).toBe(1)
    expect((await issue(second.listId)).ok).toBe(true)
    const current = await currentIssuedList(handle.db, lw.applicationId, signal)
    expect(current?.version).toBe(2)
    const [old] = await handle.db
      .select()
      .from(abutterLists)
      .where(eq(abutterLists.id, first.listId))
    expect(old).toMatchObject({ status: 'superseded', supersededBy: second.listId })
  })

  it('a new draft discards the previous draft', async () => {
    const first = await generate()
    await generate()
    const [old] = await handle.db
      .select()
      .from(abutterLists)
      .where(eq(abutterLists.id, first.listId))
    expect(old?.status).toBe('discarded')
  })

  it('staff selections carry into the next version', async () => {
    const first = await generate()
    await selectParcel(
      handle.db,
      world.staff,
      {
        listId: first.listId,
        parcelId: lw.ids.N5 ?? '',
        crossing: 'street',
        note: 'Across the road',
      },
      signal,
      LIST_NOW,
    )
    await generate()
    const candidates = await handle.db.query.abutterListCandidates.findMany()
    const held = candidates.filter((c) => c.parcelId === lw.ids.N5)
    expect(held.length).toBeGreaterThan(0)
  })

  it('excluding a candidate removes its owner with a recorded reason', async () => {
    const { listId } = await generate()
    const result = await excludeCandidate(
      handle.db,
      world.staff,
      { listId, parcelId: lw.ids.RD ?? '', reason: 'Touches only at a corner point' },
      signal,
      LIST_NOW,
    )
    expect(result.ok).toBe(true)
    const recipients = await handle.db.query.abutterListRecipients.findMany()
    expect(recipients).toHaveLength(8)
    const excluded = (await handle.db.query.abutterListCandidates.findMany()).find(
      (c) => c.parcelId === lw.ids.RD,
    )
    expect(excluded).toMatchObject({
      excluded: true,
      exclusionReason: 'Touches only at a corner point',
    })
  })

  it('a correction replaces the address, keeps the original, and survives a refresh', async () => {
    const { listId } = await generate()
    const row = (await handle.db.query.abutterListRecipients.findMany()).find(
      (r) => (r.data as { name: string }).name === 'Wren, Isolde',
    )
    const corrected = await correctRecipient(
      handle.db,
      world.staff,
      {
        listId,
        recipientId: row?.id ?? '',
        name: 'Wren, Isolde',
        mailingAddress: '9 New Road, Alder Pond NH',
        reason: 'Owner moved',
      },
      signal,
      LIST_NOW,
    )
    expect(corrected.ok).toBe(true)
    await excludeCandidate(
      handle.db,
      world.staff,
      { listId, parcelId: lw.ids.RD ?? '', reason: 'Touches only at a corner point' },
      signal,
      LIST_NOW,
    )
    const after = (await handle.db.query.abutterListRecipients.findMany()).find(
      (r) => r.id === row?.id,
    )
    const data = after?.data as {
      mailingAddress: string
      provenance: { source: string; replaced?: { mailingAddress: string } }[]
    }
    expect(data.mailingAddress).toBe('9 New Road, Alder Pond NH')
    expect(data.provenance.at(-1)).toMatchObject({
      source: 'staff_entry',
      replaced: { mailingAddress: 'PO Box 302, Alder Pond NH 03999' },
    })
  })

  it('reviewer drawing a list is forbidden', async () => {
    expect(
      await generateList(
        handle.db,
        world.reviewer,
        { applicationId: lw.applicationId },
        signal,
        LIST_NOW,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('an application that is not a board application is not_board', async () => {
    const made = await generateList(
      handle.db,
      world.staff,
      { applicationId: '00000000-0000-4000-8000-000000000000' },
      signal,
      LIST_NOW,
    )
    expect(made.ok).toBe(false)
  })
})
