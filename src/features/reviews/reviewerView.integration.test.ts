import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addReviewComment, assignReviewer } from '@/features/reviews/assignments'
import {
  getAssignmentView,
  listApplicationReviewers,
  listMyAssignments,
  listReviewerChoices,
} from '@/features/reviews/reviewerView'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let applicationId = ''
let assignmentId = ''

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  applicationId = (await makeApplication(handle.db, world, { state: 'under_review' })).applicationId
  const assigned = await assignReviewer(
    handle.db,
    world.staff,
    { applicationId, reviewerUserId: world.reviewer.userId },
    signal,
  )
  if (!assigned.ok) throw new Error('assign')
  assignmentId = assigned.value.assignmentId
  await addReviewComment(
    handle.db,
    world.reviewer,
    { assignmentId, body: 'Needs a stamped plan' },
    signal,
  )
})
afterAll(async () => {
  await handle.drop()
})

describe('reviewer views', () => {
  it('lists my assignments and shows comments on mine only', async () => {
    expect(
      (await listMyAssignments(handle.db, world.reviewer, signal)).map((a) => a.assignmentId),
    ).toEqual([assignmentId])
    const view = await getAssignmentView(handle.db, world.reviewer, assignmentId, signal)
    expect(view?.comments.map((c) => c.body)).toEqual(['Needs a stamped plan'])
    const other = await staffActor(handle.db, 'reviewer')
    expect(await getAssignmentView(handle.db, other, assignmentId, signal)).toBeNull()
    expect(await listMyAssignments(handle.db, other, signal)).toEqual([])
  })

  it('lists the application reviewers and the reviewer choices', async () => {
    expect((await listApplicationReviewers(handle.db, applicationId)).map((r) => r.status)).toEqual(
      ['commented'],
    )
    expect((await listReviewerChoices(handle.db)).map((r) => r.id)).toContain(world.reviewer.userId)
  })

  it('the review page names the project, the permit type, and the parcel', async () => {
    const view = await getAssignmentView(handle.db, world.reviewer, assignmentId, signal)
    expect(view).toMatchObject({
      projectTitle: 'Garage addition',
      typeLabel: expect.any(String),
      parcelDisplayId: '007001000000',
      commentDue: null,
    })
    expect(view?.typeLabel).not.toBe('')
  })

  it('the application reviewer list carries each reviewer id', async () => {
    expect(await listApplicationReviewers(handle.db, applicationId)).toEqual([
      expect.objectContaining({ reviewerUserId: world.reviewer.userId }),
    ])
  })
})
