import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadApplicationContext } from '@/features/applications/context'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function reviewsGate(applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('no app')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, 'decided', '2027-03-10' as CivilDate, signal),
  )
  return results.find((g) => g.key === 'reviews.signed_off')
}

describe('reviews gate', () => {
  it('a board decision is the board vote, so pending reviews do not block recording it', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
    const assigned = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect(assigned.ok).toBe(true)
    expect((await reviewsGate(app.applicationId))?.effective).toBe('pass')
  })

  it('a building permit with a pending review is blocked', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect((await reviewsGate(app.applicationId))?.effective).toBe('blocked')
  })
})
