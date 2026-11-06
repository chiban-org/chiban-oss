import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setResponsibleStaff } from '@/features/applications/responsibleStaff'
import { listWorkQueue } from '@/features/queue/workQueue'
import { assignReviewer } from '@/features/reviews/assignments'
import { loadClerkSection } from '@/features/staffHome/clerkHome'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { homeContextFor, rowCount, rowHref } from '@/test/homeFixtures'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const PAGE_SIZE = 25
const ASSIGNED = 'Assigned to you'
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  const responsible = await submittedTrade(handle.db, world)
  const reviewing = await submittedTrade(handle.db, world)
  const both = await submittedTrade(handle.db, world)
  await submittedTrade(handle.db, world)
  const set = await setResponsibleStaff(
    handle.db,
    world.admin,
    { applicationId: responsible.applicationId, userId: world.staff.userId },
    signal,
  )
  const alsoSet = await setResponsibleStaff(
    handle.db,
    world.admin,
    { applicationId: both.applicationId, userId: world.staff.userId },
    signal,
  )
  if (!set.ok || !alsoSet.ok) throw new Error('responsible staff not set')
  for (const applicationId of [reviewing.applicationId, both.applicationId]) {
    const assigned = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    if (!assigned.ok) throw new Error(assigned.error)
  }
})
afterAll(async () => {
  await handle.drop()
})

async function mine(actor: PermitWorld['staff']) {
  const ctx = await homeContextFor(handle.db, actor, NOW)
  const section = await loadClerkSection(ctx)
  const list = await listWorkQueue(
    handle.db,
    actor,
    { filters: { assigned: ['me'] }, limit: PAGE_SIZE },
    signal,
  )
  return { section, list }
}

describe('the Assigned to you row on the Applications card', () => {
  it('counts what the Mine filter lists and links to it', async () => {
    const { section, list } = await mine(world.staff)
    expect(rowCount(section, ASSIGNED)).toBe(list.rows.length)
    expect(rowCount(section, ASSIGNED)).toBe(list.total)
    expect(rowCount(section, ASSIGNED)).toBe(2)
    expect(list.rows.length).toBeLessThan(PAGE_SIZE)
    expect(rowHref(section, ASSIGNED)).toBe('/staff/applications?assigned=me')
  })

  it('leaves the card out for a viewer who cannot open Applications', async () => {
    const { section } = await mine(world.reviewer)
    expect(section).toBeNull()
  })
})
