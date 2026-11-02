import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addReviewComment, assignReviewer, signOffReview } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let applicationId: string

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  applicationId = (await makeApplication(handle.db, world)).applicationId
})
afterAll(async () => {
  await handle.drop()
})

describe('reviewer assignments', () => {
  it('assigning a user without the reviewer role is not_a_reviewer', async () => {
    const result = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId, reviewerUserId: world.applicant.userId },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'not_a_reviewer' })
  })

  it('staff without review.assign is forbidden', async () => {
    const result = await assignReviewer(
      handle.db,
      world.reviewer,
      { applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it("reviewer cannot comment on another reviewer's assignment", async () => {
    const other = await staffActor(handle.db, 'reviewer')
    const assigned = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    if (!assigned.ok) throw new Error('assign')
    const refused = await addReviewComment(
      handle.db,
      other,
      { assignmentId: assigned.value.assignmentId, body: 'Looks fine' },
      signal,
    )
    expect(refused).toEqual({ ok: false, error: 'forbidden' })
    const own = await addReviewComment(
      handle.db,
      world.reviewer,
      { assignmentId: assigned.value.assignmentId, body: 'Needs a stamped plan' },
      signal,
    )
    expect(own.ok).toBe(true)
    expect(
      await signOffReview(handle.db, other, { assignmentId: assigned.value.assignmentId }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(
      (
        await signOffReview(
          handle.db,
          world.reviewer,
          { assignmentId: assigned.value.assignmentId },
          signal,
        )
      ).ok,
    ).toBe(true)
  })

  it('assigning the same reviewer twice keeps one active assignment', async () => {
    const again = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect(again.ok).toBe(true)
  })
})
