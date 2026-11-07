import { and, eq } from 'drizzle-orm'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reviewAssignments, trcRoutings } from '@/db/schema'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import type { Actor } from '@/features/auth/actor'
import { addReviewComment, signOffReview } from '@/features/reviews/assignments'
import { type ReviewRoutesBody, ReviewRoutesBodySchema } from '@/features/reviews/routesSchema'
import { routeToTrc } from '@/features/reviews/trcRouting'
import { trcSummary, trcSummaryPdf } from '@/features/reviews/trcSummary'
import {
  type BoardWorld,
  boardIdSql,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld
let fire: Actor
let works: Actor
let police: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  fire = await staffActor(handle.db, 'reviewer')
  works = await staffActor(handle.db, 'reviewer')
  police = await staffActor(handle.db, 'reviewer')
})
afterEach(async () => {
  await handle.drop()
})

function routes(overrides: Partial<ReviewRoutesBody> = {}): ReviewRoutesBody {
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
    ...overrides,
  }
}

async function publishRoutes(body: ReviewRoutesBody = routes()) {
  await saveAndPublish(handle.db, world.admin, 'review_routes', 'default', body)
}

async function spr(meeting = '2027-04-14') {
  const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
  const meetings = await handle.db.query.boardMeetings.findMany({
    where: (m, { and: both, eq: equals }) =>
      both(equals(m.meetingDate, meeting), equals(m.boardId, boardIdSql('planning_board'))),
  })
  return { applicationId: id, meetingId: meetings[0]?.id ?? '' }
}

describe('review routes config', () => {
  it('a route naming an undefined department is invalid', () => {
    const parsed = ReviewRoutesBodySchema.safeParse(
      routes({
        routes: [
          { applicationTypeKey: 'SPR', departmentKeys: ['harbor'], commentDueDaysBeforeMeeting: 7 },
        ],
      }),
    )
    expect(parsed.success).toBe(false)
  })
})

describe('routeToTrc', () => {
  it('routing SPR assigns Fire, Public Works, and Police', async () => {
    await publishRoutes()
    const { applicationId, meetingId } = await spr()
    expect(await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)).toEqual({
      ok: true,
      value: { assigned: 3 },
    })
    const rows = await handle.db
      .select()
      .from(trcRoutings)
      .where(eq(trcRoutings.applicationId, applicationId))
    expect(rows.map((r) => r.departmentKey).sort()).toEqual(['fire', 'police', 'public_works'])
    const assigned = await handle.db
      .select()
      .from(reviewAssignments)
      .where(eq(reviewAssignments.applicationId, applicationId))
    expect(assigned.map((a) => a.reviewerUserId).sort()).toEqual(
      [fire.userId, police.userId, works.userId].sort(),
    )
  })

  it('routing twice assigns nothing new', async () => {
    await publishRoutes()
    const { applicationId, meetingId } = await spr()
    await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)
    expect(await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)).toEqual({
      ok: true,
      value: { assigned: 0 },
    })
    expect(await handle.db.select().from(reviewAssignments)).toHaveLength(3)
  })

  it('comment due 7 days before 2027-04-14 is 2027-04-07', async () => {
    await publishRoutes()
    const { applicationId, meetingId } = await spr()
    await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)
    const rows = await handle.db
      .select()
      .from(trcRoutings)
      .where(eq(trcRoutings.applicationId, applicationId))
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.commentDue === '2027-04-07')).toBe(true)
  })

  it('department with no active reviewer is reported and nothing is assigned', async () => {
    await publishRoutes(
      routes({
        departments: [
          { key: 'fire', label: 'Fire', reviewerUserIds: [fire.userId] },
          { key: 'public_works', label: 'Public Works', reviewerUserIds: [] },
          { key: 'police', label: 'Police', reviewerUserIds: [police.userId] },
        ],
      }),
    )
    const { applicationId, meetingId } = await spr()
    expect(await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)).toEqual({
      ok: false,
      error: { departmentWithoutReviewer: ['Public Works'] },
    })
    expect(await handle.db.select().from(reviewAssignments)).toEqual([])
  })

  it('an application type without a route is no_route', async () => {
    await publishRoutes()
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    expect(await routeToTrc(handle.db, world.staff, { applicationId: id }, signal)).toEqual({
      ok: false,
      error: 'no_route',
    })
  })

  it('without published routes the result is no_route', async () => {
    const { applicationId, meetingId } = await spr()
    expect(await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)).toEqual({
      ok: false,
      error: 'no_route',
    })
  })

  it('a reviewer routing is forbidden', async () => {
    await publishRoutes()
    const { applicationId, meetingId } = await spr()
    expect(await routeToTrc(handle.db, fire, { applicationId, meetingId }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('an unknown application is not_found', async () => {
    await publishRoutes()
    expect(
      await routeToTrc(
        handle.db,
        world.staff,
        { applicationId: '00000000-0000-4000-8000-000000000000' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'not_found' })
  })

  it('routed reviewer sees the application; a Fire reviewer cannot comment on the Police assignment', async () => {
    await publishRoutes()
    const { applicationId, meetingId } = await spr()
    await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)
    const seen = await listApplicationsForViewer(handle.db, fire, { limit: 25 }, signal)
    expect(seen.rows.map((r) => r.id)).toContain(applicationId)
    const [policeAssignment] = await handle.db
      .select()
      .from(reviewAssignments)
      .where(
        and(
          eq(reviewAssignments.applicationId, applicationId),
          eq(reviewAssignments.reviewerUserId, police.userId),
        ),
      )
    const comment = await addReviewComment(
      handle.db,
      fire,
      { assignmentId: policeAssignment?.id ?? '', body: 'Hydrant spacing is short.' },
      signal,
    )
    expect(comment.ok).toBe(false)
  })

  it('reviewer list query shows 2 of 30 applications with limit 25', async () => {
    await publishRoutes()
    const routed = []
    for (let i = 0; i < 30; i += 1) {
      const { applicationId, meetingId } = await spr()
      if (i < 2) {
        await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)
        routed.push(applicationId)
      }
    }
    const seen = await listApplicationsForViewer(handle.db, fire, { limit: 25 }, signal)
    expect(seen.rows.map((r) => r.id).sort()).toEqual(routed.sort())
  })
})

describe('trcSummary', () => {
  async function routedApplication() {
    await publishRoutes()
    const { applicationId, meetingId } = await spr()
    await routeToTrc(handle.db, world.staff, { applicationId, meetingId }, signal)
    return applicationId
  }

  it('summary marks an unsigned department overdue on 2027-04-08', async () => {
    const id = await routedApplication()
    const [fireAssignment] = await handle.db
      .select()
      .from(reviewAssignments)
      .where(
        and(
          eq(reviewAssignments.applicationId, id),
          eq(reviewAssignments.reviewerUserId, fire.userId),
        ),
      )
    await signOffReview(handle.db, fire, { assignmentId: fireAssignment?.id ?? '' }, signal)
    const summary = await trcSummary(handle.db, world.staff, id, signal, d('2027-04-08'))
    if (!summary.ok) throw new Error(summary.error)
    const byDepartment = Object.fromEntries(summary.value.map((s) => [s.departmentKey, s]))
    expect(byDepartment.fire).toMatchObject({
      status: 'signed_off',
      overdue: false,
      commentDue: '2027-04-07',
    })
    expect(byDepartment.police).toMatchObject({ status: 'pending', overdue: true })
    expect(byDepartment.police?.reviewerName).not.toBe('')
  })

  it('nothing is overdue on the due date itself', async () => {
    const id = await routedApplication()
    const summary = await trcSummary(handle.db, world.staff, id, signal, d('2027-04-07'))
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.value.every((s) => !s.overdue)).toBe(true)
  })

  it('summary lists the comments of each department', async () => {
    const id = await routedApplication()
    const [assignment] = await handle.db
      .select()
      .from(reviewAssignments)
      .where(
        and(
          eq(reviewAssignments.applicationId, id),
          eq(reviewAssignments.reviewerUserId, police.userId),
        ),
      )
    await addReviewComment(
      handle.db,
      police,
      { assignmentId: assignment?.id ?? '', body: 'Add a turnaround.' },
      signal,
    )
    const summary = await trcSummary(handle.db, world.staff, id, signal, d('2027-04-01'))
    if (!summary.ok) throw new Error(summary.error)
    expect(
      summary.value.find((s) => s.departmentKey === 'police')?.comments.map((c) => c.body),
    ).toEqual(['Add a turnaround.'])
  })

  it('a reviewer cannot read the whole summary', async () => {
    const id = await routedApplication()
    expect(await trcSummary(handle.db, fire, id, signal)).toEqual({ ok: false, error: 'forbidden' })
  })

  it('the summary pdf renders for a routed application and is empty for an unrouted one', async () => {
    const id = await routedApplication()
    const pdf = await trcSummaryPdf(handle.db, world.staff, id, signal)
    if (!pdf.ok) throw new Error(pdf.error)
    expect((await PDFDocument.load(pdf.value)).getPageCount()).toBeGreaterThan(0)
    const { applicationId } = await spr('2027-04-28')
    expect(await trcSummaryPdf(handle.db, world.staff, applicationId, signal)).toEqual({
      ok: false,
      error: 'empty',
    })
  })
})
