import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reviewAssignments } from '@/db/schema'
import { readQueueView } from '@/features/queue/queueParams'
import { countWorkQueue, listWorkQueue } from '@/features/queue/workQueue'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-02' as CivilDate
let handle: TestDb
let world: PermitWorld
const ids = new Map<string, string>()

type Status = 'pending' | 'commented' | 'signed_off'

async function underReview(name: string, statuses: Status[], removed: Status[] = []) {
  const made = await makeApplication(handle.db, world, { state: 'under_review' })
  ids.set(name, made.applicationId)
  const rows = [
    ...statuses.map((status) => ({ status, removedAt: null })),
    ...removed.map((status) => ({ status, removedAt: new Date() })),
  ]
  for (const row of rows) {
    await handle.db.insert(reviewAssignments).values({
      applicationId: made.applicationId,
      reviewerUserId: await makeUser(handle.db, { role: 'reviewer' }),
      assignedBy: world.staff.userId,
      ...row,
    })
  }
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  await underReview('allBack', ['signed_off', 'commented'])
  await underReview('oneWaiting', ['signed_off', 'pending'])
  await underReview('noReviewers', [])
  await underReview('removedPending', ['signed_off'], ['pending'])
  const submitted = await makeApplication(handle.db, world, { state: 'submitted' })
  await handle.db.insert(reviewAssignments).values({
    applicationId: submitted.applicationId,
    reviewerUserId: await makeUser(handle.db, { role: 'reviewer' }),
    assignedBy: world.staff.userId,
    status: 'signed_off',
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('the reviews back flag', () => {
  it('finds applications under review whose every active reviewer has answered', async () => {
    const page = await listWorkQueue(
      handle.db,
      world.staff,
      { filters: { flags: ['reviewed'] }, limit: 50 },
      signal,
    )
    expect(new Set(page.rows.map((row) => row.applicationId))).toEqual(
      new Set([ids.get('allBack'), ids.get('removedPending')]),
    )
    expect(
      await countWorkQueue(handle.db, world.staff, [{ flags: ['reviewed'] }], TODAY, signal),
    ).toEqual([2])
  })

  it('reads the flag from the list address', () => {
    expect(readQueueView({ flag: 'reviewed' }).filters.flags).toEqual(['reviewed'])
  })
})
