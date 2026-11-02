import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { recordCompletenessVote } from '@/features/boards/acceptance'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  submitBoardApplication,
} from '@/test/boardFixtures'
import {
  issueListWithRecipients,
  proveEverything,
  recipient,
  recordDesProximity,
} from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate

export interface HeldHearing {
  applicationId: string
  hearingId: string
  meetingId: string
}

async function meetingOn(db: Db, date: string, board: 'planning_board' | 'zba') {
  const rows = await db.query.boardMeetings.findMany({
    where: (m, { and, eq }) => and(eq(m.meetingDate, date), eq(m.board, board)),
  })
  const id = rows[0]?.id
  if (id === undefined) throw new AppError(ErrorIds.DB_INVARIANT, `no ${board} meeting on ${date}`)
  return id
}

async function noticeAndHold(
  db: Db,
  world: BoardWorld,
  hearing: { applicationId: string; hearingId: string; noticeSetId: string; meetingId: string },
  heldOn: string,
): Promise<HeldHearing> {
  const now = new Date(`${heldOn}T16:00:00Z`)
  await proveEverything(db, world, hearing.applicationId, hearing.noticeSetId, d('2027-03-30'), now)
  const noticed = await markProperlyNoticed(db, world.staff, hearing.hearingId, signal, now)
  if (!noticed.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'not noticed')
  const held = await markHearingHeld(
    db,
    world.staff,
    { hearingId: hearing.hearingId, heldOn: d(heldOn) },
    signal,
  )
  if (!held.ok) throw new AppError(ErrorIds.DB_INVARIANT, `not held: ${held.error}`)
  return {
    applicationId: hearing.applicationId,
    hearingId: hearing.hearingId,
    meetingId: hearing.meetingId,
  }
}

async function schedule(
  db: Db,
  world: BoardWorld,
  applicationId: string,
  date: string,
  board: 'planning_board' | 'zba',
  kind: 'submission_and_hearing' | 'public_hearing',
) {
  const meetingId = await meetingOn(db, date, board)
  const made = await scheduleHearing(db, world.staff, { applicationId, meetingId, kind }, signal)
  if (!made.ok) throw new AppError(ErrorIds.DB_INVARIANT, `schedule: ${JSON.stringify(made.error)}`)
  const [row] = await db.query.hearings.findMany({
    where: (h, { eq }) => eq(h.id, made.value.hearingId),
  })
  return {
    applicationId,
    hearingId: made.value.hearingId,
    noticeSetId: row?.noticeSetId ?? '',
    meetingId,
  }
}

export async function heldZbaHearing(
  db: Db,
  world: BoardWorld,
  options: { date?: string; regional?: 'yes' | 'no' } = {},
): Promise<HeldHearing> {
  const date = options.date ?? '2027-04-15'
  const applicationId = await submitBoardApplication(db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(db, world, applicationId, options.regional ?? 'no')
  await issueListWithRecipients(db, world, applicationId, [recipient(1), recipient(2)])
  return await noticeAndHold(
    db,
    world,
    await schedule(db, world, applicationId, date, 'zba', 'public_hearing'),
    date,
  )
}

export async function heldPbHearing(
  db: Db,
  world: BoardWorld,
  options: { date?: string; regional?: 'yes' | 'no' } = {},
): Promise<HeldHearing> {
  const date = options.date ?? '2027-05-12'
  const applicationId = await submitBoardApplication(db, world, world.pbTypeKey, '2027-03-24')
  await recordNoRegionalImpact(db, world, applicationId, options.regional ?? 'no')
  await recordDesProximity(db, world, applicationId, 'not_within')
  await issueListWithRecipients(db, world, applicationId, [recipient(1), recipient(2)])
  await schedule(db, world, applicationId, '2027-04-14', 'planning_board', 'submission_and_hearing')
  const accepted = await recordCompletenessVote(
    db,
    world.staff,
    {
      applicationId,
      meetingId: await meetingOn(db, '2027-04-14', 'planning_board'),
      votedOn: d('2027-04-14'),
      outcome: 'accepted',
    },
    signal,
  )
  if (!accepted.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `vote: ${JSON.stringify(accepted.error)}`)
  return await noticeAndHold(
    db,
    world,
    await schedule(db, world, applicationId, date, 'planning_board', 'public_hearing'),
    date,
  )
}
