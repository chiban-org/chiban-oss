import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reviewAssignments, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { addReviewComment } from '@/features/reviews/assignments'
import { routeToTrc } from '@/features/reviews/trcRouting'
import { trcSummaryPdf } from '@/features/reviews/trcSummary'
import { TRC_SUMMARY_SOURCE } from '@/features/templates/preview/extraSources'
import { renderDocument } from '@/features/templates/templateBlocks'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import { publishWordingTemplate, TOWN_WORDING } from '@/test/wordingTemplate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let applicationId: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  const fire: Actor = await staffActor(handle.db, 'reviewer')
  await handle.db.update(users).set({ displayName: 'Fran Fire' }).where(eq(users.id, fire.userId))
  await saveAndPublish(handle.db, world.admin, 'review_routes', 'default', {
    key: 'default',
    departments: [{ key: 'fire', label: 'Fire', reviewerUserIds: [fire.userId] }],
    routes: [
      {
        applicationTypeKey: world.pbTypeKey,
        departmentKeys: ['fire'],
        commentDueDaysBeforeMeeting: 7,
      },
    ],
  })
  applicationId = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
  const meetings = await handle.db.query.boardMeetings.findMany({
    where: (m, { and: both, eq: equals }) =>
      both(equals(m.meetingDate, '2027-04-14'), equals(m.board, 'planning_board')),
  })
  await routeToTrc(
    handle.db,
    world.staff,
    { applicationId, meetingId: meetings[0]?.id ?? '' },
    signal,
  )
  const [assignment] = await handle.db
    .select()
    .from(reviewAssignments)
    .where(
      and(
        eq(reviewAssignments.applicationId, applicationId),
        eq(reviewAssignments.reviewerUserId, fire.userId),
      ),
    )
  await addReviewComment(
    handle.db,
    fire,
    { assignmentId: assignment?.id ?? '', body: 'Confirm the hydrant location.' },
    signal,
  )
})
afterEach(async () => {
  await handle.drop()
})

async function realText(): Promise<string> {
  const pdf = await trcSummaryPdf(handle.db, world.staff, applicationId, signal)
  if (!pdf.ok) throw new Error(pdf.error)
  return await pdfText(pdf.value)
}

describe('technical review summary templates', () => {
  it('a published template of the kind is used', async () => {
    await publishWordingTemplate(handle.db, world.admin, 'trc_summary')
    const text = await realText()
    expect(text).toContain(TOWN_WORDING)
    expect(text).toContain('Confirm the hydrant location.')
  })

  it('the preview lists the application and rebuilds the real summary', async () => {
    const scope = { db: handle.db, actor: world.staff, signal }
    expect(await TRC_SUMMARY_SOURCE.samples(scope)).toEqual([
      { id: applicationId, label: 'SPR-2027-0001, technical review' },
    ])
    const input = await TRC_SUMMARY_SOURCE.input(scope, applicationId)
    if (input === null) throw new Error('no preview input')
    const rendered = await renderDocument('trc_summary', null, input)
    if (!rendered.ok) throw new Error('render failed')
    expect(await pdfText(rendered.value)).toBe(await realText())
  })

  it('the preview refuses someone without full record access', async () => {
    const scope = { db: handle.db, actor: world.reviewer, signal }
    expect(await TRC_SUMMARY_SOURCE.input(scope, applicationId)).toBeNull()
  })
})
