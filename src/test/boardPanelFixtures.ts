import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications } from '@/db/schema'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { boardIdOf } from '@/features/boards/townBoards'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  recordNoRegionalImpact,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { issueFixtureList } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal

export function lazy<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | null = null
  return () => {
    made ??= make()
    return made
  }
}

export async function meetingIdOn(
  db: Db,
  date: string,
  board: 'planning_board' | 'zba' = 'planning_board',
): Promise<string> {
  const boardId = await boardIdOf(db, board)
  const rows = await db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) => and(equals(m.meetingDate, date), equals(m.boardId, boardId)),
  })
  return rows[0]?.id ?? ''
}

export async function filedApplication(db: Db, world: BoardWorld, received = '2027-03-24') {
  const applicationId = await submitBoardApplication(db, world, world.pbTypeKey, received)
  await recordNoRegionalImpact(db, world, applicationId)
  await issueFixtureList(db, world, applicationId, received)
  return applicationId
}

export async function applicationWithMeetingSet(db: Db, world: BoardWorld) {
  const applicationId = await filedApplication(db, world)
  const meetingId = await meetingIdOn(db, '2027-04-14')
  await setAcceptanceMeeting(db, world.staff, { applicationId, meetingId }, signal)
  return { applicationId, meetingId }
}

export async function acceptedApplication(db: Db, world: BoardWorld) {
  const made = await applicationWithMeetingSet(db, world)
  await recordCompletenessVote(
    db,
    world.staff,
    { ...made, votedOn: '2027-04-14' as CivilDate, outcome: 'accepted' },
    signal,
    BOARD_FIXTURE_NOW,
  )
  return made
}

export async function decidedVariance(db: Db, world: BoardWorld): Promise<string> {
  const id = await submitBoardApplication(db, world, world.zbaTypeKey, '2027-03-02')
  await db
    .update(applications)
    .set({ state: 'decided', decidedOn: '2027-05-12' })
    .where(eq(applications.id, id))
  return id
}
