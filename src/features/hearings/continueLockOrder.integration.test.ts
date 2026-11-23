import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Tx } from '@/db/client'
import { hearings } from '@/db/schema'
import { continueHearing } from '@/features/hearings/continuations'
import { markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import {
  type BoardWorld,
  boardIdSql,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { runWhileApplicationLocked } from '@/test/lockOrder'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-04-10T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15', '2027-04-29'] })
})
afterEach(async () => {
  await handle.drop()
})

async function zbaMeeting(date: string): Promise<string> {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: same }) =>
      and(same(m.meetingDate, date), same(m.boardId, boardIdSql('zba'))),
  })
  return rows[0]?.id ?? ''
}

async function noticedHearing(): Promise<{ applicationId: string; hearingId: string }> {
  const applicationId = await submitBoardApplication(
    handle.db,
    world,
    world.zbaTypeKey,
    '2027-03-02',
  )
  await recordNoRegionalImpact(handle.db, world, applicationId)
  await issueListWithRecipients(handle.db, world, applicationId, [recipient(1), recipient(2)])
  const scheduled = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId, meetingId: await zbaMeeting('2027-04-15'), kind: 'public_hearing' },
    signal,
  )
  if (!scheduled.ok) throw new Error(`not scheduled: ${JSON.stringify(scheduled.error)}`)
  const { hearingId } = scheduled.value
  const [row] = await handle.db.select().from(hearings).where(eq(hearings.id, hearingId))
  await proveEverything(
    handle.db,
    world,
    applicationId,
    row?.noticeSetId ?? '',
    '2027-04-01' as CivilDate,
    NOW,
  )
  await markProperlyNoticed(handle.db, world.staff, hearingId, signal)
  return { applicationId, hearingId }
}

describe('continuing a hearing takes the application lock before the hearing', () => {
  it('leaves the hearing free to a holder of the application lock', async () => {
    const { applicationId, hearingId } = await noticedHearing()
    const toMeetingId = await zbaMeeting('2027-04-29')
    const outcome = await runWhileApplicationLocked(
      handle.db,
      applicationId,
      () =>
        continueHearing(
          handle.db,
          world.staff,
          {
            hearingId,
            toMeetingId,
            announcedAtMeeting: true,
            announcedDetails: 'Continued to April 29 at 7:00 PM in the Town Hall meeting room.',
          },
          signal,
        ),
      (tx: Tx) =>
        tx
          .select({ id: hearings.id })
          .from(hearings)
          .where(eq(hearings.id, hearingId))
          .for('update', { skipLocked: true }),
    )
    expect(outcome).toMatchObject({ finishedWhileLocked: false, rowFreeToHolder: true })
    expect(outcome.result.ok).toBe(true)
    const [prior] = await handle.db.select().from(hearings).where(eq(hearings.id, hearingId))
    expect(prior?.status).toBe('continued')
  })
})
