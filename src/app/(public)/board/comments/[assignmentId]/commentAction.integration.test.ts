import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { reviewComments } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { boardIdOf } from '@/features/boards/townBoards'
import { assignBoardForComment } from '@/features/reviews/boardAssignments'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { seatMember } from '@/test/boardReviewFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  describeActionCases,
  PORTAL_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { postBoardCommentAction } = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
let world: PermitWorld
let member: Actor
let boardId = ''

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
  boardId = await boardIdOf(h.db, 'planning_board')
  member = await seatMember(h.db, await h.actorFor('admin'), {
    email: 'robin.vale@alderpond.example',
    displayName: 'Robin Vale',
    boardId,
  })
})

async function assignment(): Promise<string> {
  const applicationId = (await applicationIn(h.db, world, 'under_review')).applicationId
  const sent = await assignBoardForComment(
    h.db,
    await h.actorFor('admin'),
    { applicationId, boardId, commentBy: null },
    signal,
  )
  if (!sent.ok) throw new Error(sent.error)
  return sent.value.assignmentId
}

describeActionCases(h, 'postBoardCommentAction', {
  invoke: postBoardCommentAction,
  actor: () => member,
  input: async () => ({ assignmentId: await assignment(), body: 'Keep the wetland buffer.' }),
  fields: { assignmentId: uuid({ required: true }), body: text({ required: true, max: 5000 }) },
  refusedRoles: ROLES,
  refusals: {
    ...PORTAL_REFUSALS,
    forbidden: { ok: false, error: 'This application is no longer with your board for comment.' },
    invalid: refusalFor({
      assignmentId: 'Choose an assignment.',
      body: {
        missing: 'Enter a comment.',
        whitespace: 'Enter a comment.',
        otherwise: 'Enter a comment of 5000 characters or fewer.',
      },
    }),
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Comment posted. The land use office can read it now.',
    })
    expect(written).toEqual(['audit_log', 'review_assignments', 'review_comments'])
    const [comment] = await db
      .select()
      .from(reviewComments)
      .where(eq(reviewComments.assignmentId, input.assignmentId))
    expect(comment?.authorUserId).toBe(member.userId)
  },
})
