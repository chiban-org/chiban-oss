import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { queueFacets } from '@/features/queue/queueFacets'
import { listWorkQueue, type WorkQueueFilters } from '@/features/queue/workQueue'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld
let planner: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  planner = await staffActor(handle.db, 'staff')
  await handle.db
    .update(users)
    .set({ displayName: 'Pat Planner' })
    .where(eq(users.id, planner.userId))
})
afterEach(async () => {
  await handle.drop()
})

async function app(responsibleUserId: string | null = null) {
  const made = await makeApplication(handle.db, world, { state: 'submitted', responsibleUserId })
  return made.applicationId
}

async function ids(filters: WorkQueueFilters, actor: Actor = world.staff) {
  const page = await listWorkQueue(handle.db, actor, { filters, limit: 25 }, signal, NOW)
  return page.rows.map((r) => r.applicationId)
}

describe('applications a staff member is responsible for', () => {
  it('counts and lists them under Mine, alongside the reviews the viewer is assigned', async () => {
    const plannerOwns = await app(planner.userId)
    const clerkOwns = await app(world.staff.userId)
    const reviewing = await app()
    await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: reviewing, reviewerUserId: world.reviewer.userId },
      signal,
    )
    const nobody = await app()
    expect(await ids({ assigned: ['me'] }, planner)).toEqual([plannerOwns])
    expect(await ids({ assigned: ['me'] })).toEqual([clerkOwns])
    expect(await ids({ assigned: ['me'] }, world.reviewer)).toEqual([reviewing])
    expect(await ids({ assigned: ['none'] })).toEqual([nobody])
    const facets = await queueFacets(handle.db, planner, { filters: {}, now: NOW }, signal)
    expect(facets.assigned.get('me')).toBe(1)
    expect(facets.assigned.get('none')).toBe(1)
  })

  it('names the responsible staff member on each row and sorts by that name', async () => {
    const plannerOwns = await app(planner.userId)
    const nobody = await app()
    const page = await listWorkQueue(
      handle.db,
      world.staff,
      { filters: {}, sort: { key: 'responsible', dir: 'asc' }, limit: 25 },
      signal,
      NOW,
    )
    const byId = new Map(page.rows.map((r) => [r.applicationId, r.responsible]))
    expect(byId.get(plannerOwns)).toBe('Pat Planner')
    expect(byId.get(nobody)).toBeNull()
    expect(page.rows.map((r) => r.applicationId)).toEqual([plannerOwns, nobody])
  })
})
