import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reviewAssignments, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { addReviewComment, signOffReview } from '@/features/reviews/assignments'
import type { ReviewRoutesBody } from '@/features/reviews/routesSchema'
import { routeToTrc } from '@/features/reviews/trcRouting'
import { trcSummaryPdf } from '@/features/reviews/trcSummary'
import {
  type BoardWorld,
  boardIdSql,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import { pdfWording } from '@/test/pdfWording'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let fire: Actor
let works: Actor
let police: Actor

async function named(db: TestDb['db'], displayName: string) {
  const actor = await staffActor(db, 'reviewer')
  await db.update(users).set({ displayName }).where(eq(users.id, actor.userId))
  return actor
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  fire = await named(handle.db, 'Fran Fire')
  works = await named(handle.db, 'Walt Works')
  police = await named(handle.db, 'Pia Police')
})
afterEach(async () => {
  vi.useRealTimers()
  await handle.drop()
})

function routes(): ReviewRoutesBody {
  return {
    key: 'default',
    departments: [
      { key: 'fire', label: 'Fire', reviewerUserIds: [fire.userId] },
      { key: 'public_works', label: 'Public Works', reviewerUserIds: [works.userId] },
      { key: 'police', label: 'Police', reviewerUserIds: [police.userId] },
    ],
    routes: [
      {
        applicationTypeKey: world.pbTypeKey,
        departmentKeys: ['fire', 'public_works', 'police'],
        commentDueDaysBeforeMeeting: 7,
      },
    ],
  }
}

describe('technical review committee summary wording', () => {
  it('summary with a sign-off and comments', async () => {
    await saveAndPublish(handle.db, world.admin, 'review_routes', 'default', routes())
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      '2027-03-24',
    )
    const meetings = await handle.db.query.boardMeetings.findMany({
      where: (m, { and: both, eq: equals }) =>
        both(equals(m.meetingDate, '2027-04-14'), equals(m.boardId, boardIdSql('planning_board'))),
    })
    await routeToTrc(
      handle.db,
      world.staff,
      { applicationId, meetingId: meetings[0]?.id ?? '' },
      signal,
    )
    const assignmentOf = async (actor: Actor) => {
      const [row] = await handle.db
        .select()
        .from(reviewAssignments)
        .where(
          and(
            eq(reviewAssignments.applicationId, applicationId),
            eq(reviewAssignments.reviewerUserId, actor.userId),
          ),
        )
      return row?.id ?? ''
    }
    await addReviewComment(
      handle.db,
      police,
      { assignmentId: await assignmentOf(police), body: 'Add a turnaround at the driveway.' },
      signal,
    )
    await addReviewComment(
      handle.db,
      police,
      { assignmentId: await assignmentOf(police), body: 'Confirm the hydrant location.' },
      signal,
    )
    await signOffReview(handle.db, fire, { assignmentId: await assignmentOf(fire) }, signal)
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-04-01T16:00:00Z') })
    const pdf = await trcSummaryPdf(handle.db, world.staff, applicationId, signal)
    vi.useRealTimers()
    if (!pdf.ok) throw new Error(pdf.error)
    expect(await pdfWording(pdf.value)).toMatchInlineSnapshot(`
      "Town of Alder Pond

      Technical Review Committee summary

      SPR-2027-0001

      Department
      Reviewer
      Status
      Comments due

      Fire
      Fran Fire
      Signed off
      April 7, 2027
      Police
      Pia Police
      Commented
      April 7, 2027
      Public Works
      Walt Works
      Pending
      April 7, 2027

      Police

      Add a turnaround at the driveway.

      Confirm the hydrant location.

      Page 1 of 1

      "
    `)
  })
})
