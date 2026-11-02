import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { postEntry } from '@/features/ledger/postEntry'
import { listVisibleEntries } from '@/features/ledger/visibility'
import { addParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
})
afterEach(async () => {
  await handle.drop()
})

async function payFor(trade: TradeFixture, payerUserId?: string) {
  const posted = await handle.db.transaction((tx) =>
    postEntry(
      tx,
      {
        entryType: 'payment',
        method: 'cash',
        amountCents: 4500,
        postedAt: new Date('2027-03-02T15:00:00Z'),
        payerName: 'Payer',
        payerUserId,
        actor: { kind: 'user', userId: world.staff.userId },
        allocations: [lineAllocation(trade, 4500)],
      },
      signal,
    ),
  )
  if (!posted.ok) throw new Error(posted.error)
}

async function otherProject() {
  const stranger = await staffActor(handle.db, 'applicant')
  const project = await createProject(
    handle.db,
    stranger,
    { parcelId: world.parcelId, title: 'Other job' },
    signal,
  )
  if (!project.ok) throw new Error('project')
  return { stranger, projectId: project.value.projectId }
}

describe('ledgerEntryVisibleTo', () => {
  it('applicant sees 2 of 30 entries with limit 25', async () => {
    const mine = [await submittedTrade(handle.db, world), await submittedTrade(handle.db, world)]
    for (const trade of mine) await payFor(trade)
    const other = await otherProject()
    for (let i = 0; i < 28; i += 1) {
      await payFor(await submittedTrade(handle.db, world, undefined, other.projectId))
    }
    const seen = await listVisibleEntries(handle.db, world.applicant, { limit: 25 }, signal)
    expect(seen).toHaveLength(2)
    const staffSeen = await listVisibleEntries(handle.db, world.staff, { limit: 25 }, signal)
    expect(staffSeen).toHaveLength(25)
  })

  it('contractor party who did not pay sees no entries', async () => {
    const trade = await submittedTrade(handle.db, world)
    await payFor(trade)
    const contractor = await staffActor(handle.db, 'contractor')
    const added = await addParty(
      handle.db,
      world.staff,
      { projectId: world.projectId, role: 'contractor', name: 'Pat', userId: contractor.userId },
      signal,
    )
    expect(added.ok).toBe(true)
    expect(await listVisibleEntries(handle.db, contractor, { limit: 25 }, signal)).toHaveLength(0)
  })

  it('a contractor sees the entry they paid', async () => {
    const trade = await submittedTrade(handle.db, world)
    const contractor = await staffActor(handle.db, 'contractor')
    await payFor(trade, contractor.userId)
    expect(await listVisibleEntries(handle.db, contractor, { limit: 25 }, signal)).toHaveLength(1)
  })

  it('reviewer sees no entries', async () => {
    await payFor(await submittedTrade(handle.db, world))
    expect(await listVisibleEntries(handle.db, world.reviewer, { limit: 25 }, signal)).toHaveLength(
      0,
    )
  })

  it("another applicant's entry is invisible", async () => {
    await payFor(await submittedTrade(handle.db, world))
    const other = await otherProject()
    expect(await listVisibleEntries(handle.db, other.stranger, { limit: 25 }, signal)).toHaveLength(
      0,
    )
  })

  it('a null actor sees nothing', async () => {
    await payFor(await submittedTrade(handle.db, world))
    expect(await listVisibleEntries(handle.db, null, { limit: 25 }, signal)).toHaveLength(0)
  })
})
