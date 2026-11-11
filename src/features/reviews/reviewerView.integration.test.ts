import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { defaultSort } from '@/features/dataTable/sort'
import { addReviewComment, assignReviewer } from '@/features/reviews/assignments'
import {
  getAssignmentView,
  listApplicationReviewers,
  listReviewerChoices,
  withReviewComments,
} from '@/features/reviews/reviewerView'
import { listReviewTable, REVIEW_SORT } from '@/features/reviews/reviewList'
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
async function openReviews(actor: Actor) {
  const list = await listReviewTable(
    handle.db,
    actor,
    { tab: 'open', sort: defaultSort(REVIEW_SORT) },
    signal,
  )
  return list.rows
}

afterAll(async () => {
  await handle.drop()
})

describe('reviewer views', () => {
  it('lists my assignments and shows comments on mine only', async () => {
    expect((await openReviews(world.reviewer)).map((a) => a.assignmentId)).toEqual([assignmentId])
    const view = await getAssignmentView(handle.db, world.reviewer, assignmentId, signal)
    expect(view?.comments.map((c) => c.body)).toEqual(['Needs a stamped plan'])
    const other = await staffActor(handle.db, 'reviewer')
    expect(await getAssignmentView(handle.db, other, assignmentId, signal)).toBeNull()
    expect(await openReviews(other)).toEqual([])
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

  it('staff see each reviewer comment on the application, oldest first', async () => {
    await addReviewComment(
      handle.db,
      world.reviewer,
      { assignmentId, body: 'Setback is fine' },
      signal,
    )
    const reviewers = await listApplicationReviewers(handle.db, applicationId)
    const shown = await withReviewComments(handle.db, world.staff, reviewers, signal)
    expect(shown).toEqual([
      expect.objectContaining({
        assignmentId,
        comments: [
          { body: 'Needs a stamped plan', createdAt: expect.any(Date) },
          { body: 'Setback is fine', createdAt: expect.any(Date) },
        ],
      }),
    ])
  })

  it('a reviewer or applicant gets no comment text through the application list', async () => {
    const reviewers = await listApplicationReviewers(handle.db, applicationId)
    for (const actor of [world.reviewer, world.applicant]) {
      const shown = await withReviewComments(handle.db, actor, reviewers, signal)
      expect(shown.flatMap((r) => r.comments)).toEqual([])
    }
  })
})
