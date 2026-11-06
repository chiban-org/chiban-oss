import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { assignReviewer } from '@/features/reviews/assignments'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { assignReviewerAction, removeReviewerAction, addReviewCommentAction, signOffReviewAction } =
  await import('./actions')

const h = actionHarness()
let world: PermitWorld
const signal = new AbortController().signal

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const underReview = async () => (await applicationIn(h.db, world, 'under_review')).applicationId
const NOT_REVIEWER = 'That person does not have the reviewer role.'
const NOT_REVIEWER_ROLES = ROLES.filter((r) => r !== 'reviewer')

async function assignment(): Promise<string> {
  const applicationId = await underReview()
  const assigned = await assignReviewer(
    h.db,
    await h.actorFor('admin'),
    { applicationId, reviewerUserId: (await h.actorFor('reviewer')).userId },
    signal,
  )
  if (!assigned.ok) throw new Error(assigned.error)
  return assigned.value.assignmentId
}

describeActionCases(h, 'assignReviewerAction', {
  invoke: assignReviewerAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await underReview(),
    reviewerUserId: (await h.actorFor('reviewer')).userId,
  }),
  fields: { applicationId: uuid({ required: true }), reviewerUserId: uuid({ required: true }) },
  capability: 'review.assign',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      reviewerUserId: 'Choose a reviewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Reviewer assigned.' })
    expect(written).toEqual(['audit_log', 'notification_outbox', 'review_assignments'])
  },
})

describeActionCases(h, 'removeReviewerAction', {
  invoke: removeReviewerAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ assignmentId: await assignment() }),
  fields: { assignmentId: uuid({ required: true }) },
  capability: 'review.assign',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ assignmentId: 'Choose an assignment.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Reviewer removed.' })
    expect(written).toEqual(['audit_log', 'review_assignments'])
  },
})

describeActionCases(h, 'addReviewCommentAction', {
  invoke: addReviewCommentAction,
  actor: () => h.actorFor('reviewer'),
  input: async () => ({ assignmentId: await assignment(), body: 'Septic design looks complete.' }),
  fields: { assignmentId: uuid({ required: true }), body: text({ required: true, max: 5000 }) },
  refusedRoles: NOT_REVIEWER_ROLES,
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      assignmentId: 'Choose an assignment.',
      body: {
        missing: 'Enter a comment.',
        whitespace: 'Enter a comment.',
        otherwise: 'Enter a comment of 5000 characters or fewer.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Comment added.' })
    expect(written).toEqual(['audit_log', 'review_assignments', 'review_comments'])
  },
})

describeActionCases(h, 'signOffReviewAction', {
  invoke: signOffReviewAction,
  actor: () => h.actorFor('reviewer'),
  input: async () => ({ assignmentId: await assignment() }),
  fields: { assignmentId: uuid({ required: true }) },
  refusedRoles: NOT_REVIEWER_ROLES,
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ assignmentId: 'Choose an assignment.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Review signed off.' })
    expect(written).toEqual(['audit_log', 'review_assignments'])
  },
})

describe('review sweep findings', () => {
  it('names the Comment field for a comment of spaces and the Reviewer field for a non-reviewer', async () => {
    h.signIn(await h.actorFor('reviewer'))
    const blank = await addReviewCommentAction(
      h.form({ assignmentId: await assignment(), body: '   ' }),
    )
    expect(blank).toEqual(refuseField('body', 'Enter a comment.'))
    h.signIn(await h.actorFor('staff'))
    const notReviewer = await assignReviewerAction(
      h.form({
        applicationId: await underReview(),
        reviewerUserId: (await h.actorFor('staff')).userId,
      }),
    )
    expect(notReviewer).toEqual(refuseField('reviewerUserId', NOT_REVIEWER))
  })
})
