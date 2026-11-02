import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { listWorkQueue, type WorkQueueFilters } from '@/features/queue/workQueue'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
})
afterEach(async () => {
  await handle.drop()
})

async function addClock(applicationId: string, due: string, status: 'running' | 'met' = 'running') {
  await handle.db.insert(clocks).values({
    applicationId,
    ruleKey: 'nh.bp.decision',
    ruleVersion: 1,
    packVersion: '0.3.0',
    startEvent: 'application_completed',
    startDate: '2027-02-01',
    lengthValue: 30,
    lengthUnit: 'days',
    countingMethod: 'test',
    computedDue: due,
    currentDue: due,
    source: 'pack_rule',
    status,
  })
}

const list = (filters: WorkQueueFilters = {}, actor = world.staff, limit = 25, cursor?: string) =>
  listWorkQueue(
    handle.db,
    actor,
    { filters, limit, ...(cursor === undefined ? {} : { cursor }) },
    signal,
    NOW,
  )

describe('work queue', () => {
  it('reviewer queue total counts only the 2 assigned of 30', async () => {
    const ids: string[] = []
    for (let i = 0; i < 30; i += 1) {
      ids.push((await makeApplication(handle.db, world, { state: 'submitted' })).applicationId)
    }
    for (const id of ids.slice(0, 2)) {
      await assignReviewer(
        handle.db,
        world.staff,
        { applicationId: id, reviewerUserId: world.reviewer.userId },
        signal,
      )
    }
    const page = await list({}, world.reviewer)
    expect(page.rows).toHaveLength(2)
    expect(page.total).toBe(2)
    expect(page.nextCursor).toBeNull()
    expect(page.rows[0]?.reviewers[0]).toMatchObject({ status: 'pending' })
    const all = await list({}, world.staff, 25)
    expect(all.total).toBe(30)
    expect(all.rows).toHaveLength(25)
    expect(all.nextCursor).not.toBeNull()
  })

  it('an applicant gets no staff queue rows', async () => {
    await makeApplication(handle.db, world, { state: 'submitted' })
    const stranger = await list({}, await staffActor(handle.db, 'applicant'))
    expect(stranger.total).toBe(0)
    expect(stranger.rows).toEqual([])
  })

  it('staff queue sorts by nearest due date, with no clock last', async () => {
    const late = await makeApplication(handle.db, world, {
      state: 'submitted',
      receivedDate: '2027-01-01',
    })
    const soon = await makeApplication(handle.db, world, {
      state: 'submitted',
      receivedDate: '2027-02-01',
    })
    const none = await makeApplication(handle.db, world, {
      state: 'submitted',
      receivedDate: '2026-12-01',
    })
    await addClock(late.applicationId, '2027-04-30')
    await addClock(soon.applicationId, '2027-03-10')
    const page = await list()
    expect(page.rows.map((r) => r.applicationId)).toEqual([
      soon.applicationId,
      late.applicationId,
      none.applicationId,
    ])
    expect(page.rows[0]).toMatchObject({ nextDue: '2027-03-10', dueStatus: 'ok', daysUntilDue: 8 })
    expect(page.rows[2]).toMatchObject({ nextDue: null, dueStatus: 'none' })
  })

  it('overdue filter returns only applications with an overdue clock, and warning is within 5 days', async () => {
    const overdue = await makeApplication(handle.db, world, { state: 'submitted' })
    const warn = await makeApplication(handle.db, world, { state: 'submitted' })
    const fine = await makeApplication(handle.db, world, { state: 'submitted' })
    await addClock(overdue.applicationId, '2027-03-01')
    await addClock(warn.applicationId, '2027-03-05')
    await addClock(fine.applicationId, '2027-06-01')
    const only = await list({ overdueOnly: true })
    expect(only.rows.map((r) => r.applicationId)).toEqual([overdue.applicationId])
    expect(only.total).toBe(1)
    const all = await list()
    const byId = new Map(all.rows.map((r) => [r.applicationId, r.dueStatus]))
    expect(byId.get(overdue.applicationId)).toBe('overdue')
    expect(byId.get(warn.applicationId)).toBe('warning')
    expect(byId.get(fine.applicationId)).toBe('ok')
  })

  it('awaiting payment filter returns only applications with fees due', async () => {
    const trade = await submittedTrade(handle.db, world)
    await makeApplication(handle.db, world, { state: 'submitted' })
    const due = await list({ awaitingPayment: true })
    expect(due.rows.map((r) => r.applicationId)).toEqual([trade.applicationId])
    expect(due.rows[0]?.feesDueCents).toBeGreaterThan(0)
  })

  it('finds an application by part of its number and treats wildcards literally', async () => {
    const a = await makeApplication(handle.db, world, { state: 'submitted' })
    await makeApplication(handle.db, world, { state: 'submitted' })
    const hit = await list({ numberContains: a.number.slice(-4) })
    expect(hit.rows.map((r) => r.number)).toContain(a.number)
    expect((await list({ numberContains: '%%' })).total).toBe(0)
  })

  it('filters by state, type, and assigned to me', async () => {
    const a = await makeApplication(handle.db, world, { state: 'under_review' })
    await makeApplication(handle.db, world, { state: 'submitted' })
    await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: a.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect((await list({ states: ['under_review'] })).rows.map((r) => r.applicationId)).toEqual([
      a.applicationId,
    ])
    expect((await list({ typeKeys: ['EL'] })).total).toBe(0)
    expect((await list({ assignedToMe: true }, world.reviewer)).total).toBe(1)
    expect((await list({ assignedToMe: true })).total).toBe(0)
  })
})
