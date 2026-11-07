import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { boardIdOf } from '@/features/boards/townBoards'
import { assignReviewer } from '@/features/reviews/assignments'
import { assignBoardForComment } from '@/features/reviews/boardAssignments'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { seatMember } from '@/test/boardReviewFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  date,
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
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const {
  assignReviewerAction,
  removeReviewerAction,
  addReviewCommentAction,
  signOffReviewAction,
  sendToBoardAction,
  withdrawBoardAction,
} = await import('./actions')

const h = actionHarness()
let world: PermitWorld
const signal = new AbortController().signal

let planningBoard = ''

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
  planningBoard = await boardIdOf(h.db, 'planning_board')
  await seatMember(h.db, await h.actorFor('admin'), {
    email: 'robin.vale@alderpond.example',
    displayName: 'Robin Vale',
    boardId: planningBoard,
  })
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

async function boardAssignment(): Promise<string> {
  const sent = await assignBoardForComment(
    h.db,
    await h.actorFor('admin'),
    { applicationId: await underReview(), boardId: planningBoard, commentBy: null },
    signal,
  )
  if (!sent.ok) throw new Error(sent.error)
  return sent.value.assignmentId
}

describeActionCases(h, 'sendToBoardAction', {
  invoke: sendToBoardAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: await underReview(),
    boardId: planningBoard,
    commentBy: '2027-04-01',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    boardId: uuid({ required: true }),
    commentBy: date({ required: false }),
  },
  capability: 'review.assign',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      boardId: 'Choose a board.',
      commentBy: 'Enter the comment-by date as a date.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Sent to the board for comment. 1 member will be emailed.',
    })
    expect(written).toEqual(['audit_log', 'notification_outbox', 'review_assignments'])
  },
})

describeActionCases(h, 'withdrawBoardAction', {
  invoke: withdrawBoardAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ assignmentId: await boardAssignment() }),
  fields: { assignmentId: uuid({ required: true }) },
  capability: 'review.assign',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({ assignmentId: 'Choose an assignment.' }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Request for comment withdrawn.' })
    expect(written).toEqual(['audit_log', 'review_assignments'])
  },
})

describe('board comment refusals', () => {
  it('names the Board field when the board cannot be sent the application', async () => {
    h.signIn(await h.actorFor('staff'))
    const refused = await sendToBoardAction(
      h.form({
        applicationId: await underReview(),
        boardId: '00000000-0000-4000-8000-000000000000',
      }),
    )
    expect(refused).toEqual(
      refuseField('boardId', 'Choose an active board that is not deciding this application.'),
    )
  })
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
