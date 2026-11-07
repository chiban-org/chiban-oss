import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, boards, reviewAssignments, reviewComments } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { boardIdOf } from '@/features/boards/townBoards'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { addReviewComment, signOffReview } from '@/features/reviews/assignments'
import {
  assignableBoards,
  assignBoardForComment,
  withdrawBoardAssignment,
} from '@/features/reviews/boardAssignments'
import {
  getBoardAssignmentView,
  listApplicationBoardAssignments,
  listMemberBoardAssignments,
} from '@/features/reviews/boardAssignmentView'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { addBoard, seatMember } from '@/test/boardReviewFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let conservation = ''
let historic = ''
let archived = ''
let lee: Actor
let hal: Actor
let pbApp = ''

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  conservation = await addBoard(handle.db, {
    kind: 'conservation_commission',
    name: 'Alder Pond Conservation Commission',
    shortName: 'Conservation Commission',
  })
  historic = await addBoard(handle.db, {
    kind: 'historic_district_commission',
    name: 'Alder Pond Historic District Commission',
    shortName: 'Historic District Commission',
  })
  archived = await addBoard(handle.db, {
    kind: 'heritage_commission',
    name: 'Alder Pond Heritage Commission',
    shortName: 'Heritage Commission',
  })
  await handle.db.update(boards).set({ archivedAt: new Date() }).where(eq(boards.id, archived))
  lee = await seatMember(handle.db, world.staff, {
    email: 'lee.marsh@alderpond.example',
    displayName: 'Lee Marsh',
    boardId: conservation,
  })
  await seatMember(handle.db, world.staff, {
    email: 'pat.former@alderpond.example',
    displayName: 'Pat Former',
    boardId: conservation,
    termStart: '2019-01-01',
    termEnd: '2020-06-30',
  })
  hal = await seatMember(handle.db, world.staff, {
    email: 'hal.historic@alderpond.example',
    displayName: 'Hal Historic',
    boardId: historic,
  })
  pbApp = (await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR'))
    .applicationId
})

afterAll(async () => {
  await handle.drop()
})

function send(
  actor: Actor,
  input: { applicationId: string; boardId: string; commentBy?: string | null },
  mail = createMemoryTransport(),
) {
  return assignBoardForComment(
    handle.db,
    mail,
    actor,
    {
      applicationId: input.applicationId,
      boardId: input.boardId,
      commentBy: (input.commentBy ?? null) as CivilDate | null,
    },
    signal,
  )
}

describe('which boards can be sent an application', () => {
  it('offers every active board except the one deciding the application', async () => {
    const offered = await assignableBoards(handle.db, pbApp, signal)
    expect(offered.map((b) => b.name)).toEqual([
      'Alder Pond Zoning Board of Adjustment',
      'Alder Pond Conservation Commission',
      'Alder Pond Historic District Commission',
    ])
  })

  it('offers every active board for an application no board decides', async () => {
    const building = await makeApplication(handle.db, world, { state: 'under_review' })
    const offered = await assignableBoards(handle.db, building.applicationId, signal)
    expect(offered.map((b) => b.name)).toContain('Alder Pond Planning Board')
    expect(offered.map((b) => b.name)).not.toContain('Alder Pond Heritage Commission')
  })

  it('refuses the deciding board and an archived board', async () => {
    const deciding = await send(world.staff, {
      applicationId: pbApp,
      boardId: await boardIdOf(handle.db, 'planning_board'),
    })
    expect(deciding).toEqual({ ok: false, error: 'board_not_assignable' })
    const gone = await send(world.staff, { applicationId: pbApp, boardId: archived })
    expect(gone).toEqual({ ok: false, error: 'board_not_assignable' })
  })

  it('refuses someone without review.assign', async () => {
    expect(await send(world.reviewer, { applicationId: pbApp, boardId: historic })).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('sending an application to a board', () => {
  it('stores the board, the comment-by date and an audit row, and emails seated members only', async () => {
    const app = (
      await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
    ).applicationId
    const mail = createMemoryTransport()
    const sent = await send(
      world.staff,
      { applicationId: app, boardId: conservation, commentBy: '2027-04-01' },
      mail,
    )
    if (!sent.ok) throw new Error(sent.error)
    expect(sent.value).toMatchObject({ alreadyAssigned: false, emailed: 1 })
    const [row] = await handle.db
      .select()
      .from(reviewAssignments)
      .where(eq(reviewAssignments.id, sent.value.assignmentId))
    expect(row).toMatchObject({
      boardId: conservation,
      reviewerUserId: null,
      commentBy: '2027-04-01',
      status: 'pending',
    })
    expect(mail.sent.map((m) => m.to)).toEqual(['lee.marsh@alderpond.example'])
    expect(mail.sent[0]?.subject).toMatch(/^Comments requested: /)
    expect(mail.sent[0]?.text).toContain('/board')
    expect(mail.sent[0]?.text).toContain('Alder Pond Conservation Commission')
    expect(mail.sent[0]?.text).toContain('Comments by April 1, 2027.')
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'review.board_assign'), eq(auditLog.entityId, app)))
    expect(audits).toHaveLength(1)

    const again = await send(world.staff, { applicationId: app, boardId: conservation }, mail)
    expect(again.ok && again.value.alreadyAssigned).toBe(true)
    expect(mail.sent).toHaveLength(1)
  })

  it('withdraws with an audit row, and a second withdraw is not found', async () => {
    const app = (
      await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
    ).applicationId
    const sent = await send(world.staff, { applicationId: app, boardId: historic })
    if (!sent.ok) throw new Error(sent.error)
    const input = { assignmentId: sent.value.assignmentId }
    expect(await withdrawBoardAssignment(handle.db, world.reviewer, input, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await withdrawBoardAssignment(handle.db, world.staff, input, signal)).ok).toBe(true)
    expect(await withdrawBoardAssignment(handle.db, world.staff, input, signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'review.board_withdraw'), eq(auditLog.entityId, app)))
    expect(audits).toHaveLength(1)
  })
})

describe('a board member commenting', () => {
  it('records the member, moves the assignment to Comments received and shows the attribution', async () => {
    const app = (
      await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
    ).applicationId
    const sent = await send(world.staff, {
      applicationId: app,
      boardId: conservation,
      commentBy: '2027-04-01',
    })
    if (!sent.ok) throw new Error(sent.error)
    const assignmentId = sent.value.assignmentId

    const listed = await listMemberBoardAssignments(handle.db, lee, signal)
    expect(listed.find((r) => r.assignmentId === assignmentId)).toMatchObject({
      boardShortName: 'Conservation Commission',
      commentBy: '2027-04-01',
      statusLabel: 'Waiting for comments',
    })
    expect(
      (await listMemberBoardAssignments(handle.db, hal, signal)).map((r) => r.assignmentId),
    ).not.toContain(assignmentId)
    expect(await getBoardAssignmentView(handle.db, hal, assignmentId, signal)).toBeNull()

    expect(
      await addReviewComment(handle.db, hal, { assignmentId, body: 'Not ours' }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(
      await addReviewComment(handle.db, lee, { assignmentId, body: 'Keep the buffer.' }, signal),
    ).toEqual({ ok: true, value: undefined })
    const [comment] = await handle.db
      .select()
      .from(reviewComments)
      .where(eq(reviewComments.assignmentId, assignmentId))
    expect(comment?.authorUserId).toBe(lee.userId)

    const view = await getBoardAssignmentView(handle.db, lee, assignmentId, signal)
    expect(view).toMatchObject({ statusLabel: 'Comments received', open: true })
    const staffSide = await listApplicationBoardAssignments(handle.db, app)
    expect(staffSide).toEqual([
      expect.objectContaining({
        assignmentId,
        boardName: 'Alder Pond Conservation Commission',
        statusLabel: 'Comments received',
        commentBy: '2027-04-01',
        comments: [
          expect.objectContaining({
            body: 'Keep the buffer.',
            attribution: 'Lee Marsh, Conservation Commission',
          }),
        ],
      }),
    ])
  })

  it('has no sign-off', async () => {
    const app = (
      await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
    ).applicationId
    const sent = await send(world.staff, { applicationId: app, boardId: conservation })
    if (!sent.ok) throw new Error(sent.error)
    expect(
      await signOffReview(handle.db, lee, { assignmentId: sent.value.assignmentId }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('cannot comment after the request is withdrawn', async () => {
    const app = (
      await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
    ).applicationId
    const sent = await send(world.staff, { applicationId: app, boardId: conservation })
    if (!sent.ok) throw new Error(sent.error)
    const assignmentId = sent.value.assignmentId
    await withdrawBoardAssignment(handle.db, world.staff, { assignmentId }, signal)
    expect(await getBoardAssignmentView(handle.db, lee, assignmentId, signal)).toBeNull()
    expect(await addReviewComment(handle.db, lee, { assignmentId, body: 'Late' }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('the reviews gate', () => {
  it('ignores a board assignment on a building permit', async () => {
    const app = (await makeApplication(handle.db, world, { state: 'under_review' })).applicationId
    const sent = await send(world.staff, { applicationId: app, boardId: conservation })
    if (!sent.ok) throw new Error(sent.error)
    const context = await loadApplicationContext(handle.db, app, signal)
    if (context === null) throw new Error('no app')
    const results = await handle.db.transaction((tx) =>
      evaluateGates(tx, context, 'decided', '2027-03-10' as CivilDate, signal),
    )
    expect(results.find((g) => g.key === 'reviews.signed_off')).toMatchObject({
      effective: 'blocked',
      outcome: { status: 'blocked', reason: 'No reviewer is assigned.' },
    })
  })
})
