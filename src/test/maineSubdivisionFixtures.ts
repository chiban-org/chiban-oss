import { ME_PACK } from '@packs/me'
import { and, eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { clocks, noticeItems } from '@/db/schema'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { recordSourceWaterDetermination } from '@/features/boards/sourceWater'
import { recordDecision } from '@/features/decisions/recordDecision'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { prepareReceiptNotices } from '@/features/notices/receiptNotices'
import {
  type BoardWorld,
  boardIdSql,
  boardTypeBody,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { FIXTURE_VOTES } from '@/test/hearingFixtures'
import { ME_TEST_CONTACTS } from '@/test/maineAbutterWorld'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate

export const SUBDIVISION_TYPE = 'SUB'
export const RECEIVED = '2027-03-02'
export const ACCEPTANCE_MEETING = '2027-03-24'
export const HEARING_MEETING = '2027-04-14'

export async function publishSubdivisionType(db: Db, world: BoardWorld): Promise<void> {
  await saveAndPublish(db, world.admin, 'regional_contacts', 'default', ME_TEST_CONTACTS)
  await saveAndPublish(
    db,
    world.admin,
    'application_type',
    SUBDIVISION_TYPE,
    boardTypeBody('me.pb_subdivision', SUBDIVISION_TYPE, 'SUB', {}, ME_PACK),
  )
}

export async function pbMeetingOn(db: Db, date: string): Promise<string> {
  const rows = await db.query.boardMeetings.findMany({
    where: (m, { and: both, eq: same }) =>
      both(same(m.meetingDate, date), same(m.boardId, boardIdSql('planning_board'))),
  })
  const id = rows[0]?.id
  if (id === undefined) throw new AppError(ErrorIds.DB_INVARIANT, `no meeting on ${date}`)
  return id
}

export async function clocksOf(db: Db, applicationId: string, ruleKey: string) {
  return await db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, ruleKey)))
}

export async function itemsOf(db: Db, setId: string) {
  return await db.select().from(noticeItems).where(eq(noticeItems.setId, setId))
}

export async function receivedSubdivision(
  db: Db,
  world: BoardWorld,
  water: 'within' | 'not_within',
): Promise<string> {
  const id = await submitBoardApplication(db, world, SUBDIVISION_TYPE, RECEIVED)
  const determined = await recordSourceWaterDetermination(
    db,
    world.staff,
    {
      applicationId: id,
      determination: water,
      supplierKey: water === 'within' ? 'fernhollow_water' : null,
    },
    signal,
    new Date(`${RECEIVED}T16:00:00Z`),
  )
  if (!determined.ok) throw new AppError(ErrorIds.DB_INVARIANT, `water: ${determined.error}`)
  await issueListWithRecipients(db, world, id, [
    recipient(1),
    recipient(2),
    recipient(3, ['municipal_clerk']),
    recipient(4, ['municipal_reviewing_authority']),
    recipient(5, ['applicant']),
    ...(water === 'within' ? [recipient(6, ['water_supplier'])] : []),
  ])
  return id
}

export async function preparedReceipt(db: Db, world: BoardWorld, id: string): Promise<string> {
  const prepared = await prepareReceiptNotices(db, world.staff, { applicationId: id }, signal)
  if (!prepared.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `prepare: ${JSON.stringify(prepared.error)}`)
  }
  return prepared.value.noticeSetId
}

export async function proveReceipt(db: Db, world: BoardWorld, id: string, setId: string) {
  await proveEverything(db, world, id, setId, d('2027-03-08'), new Date('2027-03-08T16:00:00Z'))
}

export async function acceptAtMeeting(db: Db, world: BoardWorld, id: string): Promise<void> {
  const meetingId = await pbMeetingOn(db, ACCEPTANCE_MEETING)
  const set = await setAcceptanceMeeting(db, world.staff, { applicationId: id, meetingId }, signal)
  if (!set.ok) throw new AppError(ErrorIds.DB_INVARIANT, `acceptance: ${JSON.stringify(set.error)}`)
  const voted = await recordCompletenessVote(
    db,
    world.staff,
    { applicationId: id, meetingId, votedOn: d(ACCEPTANCE_MEETING), outcome: 'accepted' },
    signal,
    new Date(`${ACCEPTANCE_MEETING}T16:00:00Z`),
  )
  if (!voted.ok) throw new AppError(ErrorIds.DB_INVARIANT, `vote: ${JSON.stringify(voted.error)}`)
}

export async function scheduleSubdivisionHearing(db: Db, world: BoardWorld, id: string) {
  const meetingId = await pbMeetingOn(db, HEARING_MEETING)
  const scheduled = await scheduleHearing(
    db,
    world.staff,
    { applicationId: id, meetingId, kind: 'public_hearing' },
    signal,
  )
  if (!scheduled.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `schedule: ${JSON.stringify(scheduled.error)}`)
  }
  const [hearing] = await db.query.hearings.findMany({
    where: (h, { eq: same }) => same(h.id, scheduled.value.hearingId),
  })
  return { hearingId: scheduled.value.hearingId, noticeSetId: hearing?.noticeSetId ?? '' }
}

export async function holdSubdivisionHearing(
  db: Db,
  world: BoardWorld,
  id: string,
  hearing: { hearingId: string; noticeSetId: string },
): Promise<void> {
  const now = new Date(`${HEARING_MEETING}T16:00:00Z`)
  await proveEverything(db, world, id, hearing.noticeSetId, d('2027-04-01'), now)
  const noticed = await markProperlyNoticed(db, world.staff, hearing.hearingId, signal, now)
  if (!noticed.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'not noticed')
  const held = await markHearingHeld(
    db,
    world.staff,
    { hearingId: hearing.hearingId, heldOn: d(HEARING_MEETING) },
    signal,
    now,
  )
  if (!held.ok) throw new AppError(ErrorIds.DB_INVARIANT, `not held: ${held.error}`)
}

export async function decideSubdivision(
  db: Db,
  world: BoardWorld,
  id: string,
  hearingId: string | null,
) {
  return await recordDecision(
    db,
    world.staff,
    {
      applicationId: id,
      hearingId,
      meetingId: hearingId === null ? await pbMeetingOn(db, HEARING_MEETING) : undefined,
      votedOn: d(HEARING_MEETING),
      outcome: 'approved',
      motion: 'Move to approve the subdivision as presented.',
      votes: FIXTURE_VOTES,
      findings: 'The subdivision meets each criterion of the ordinance.',
      significant: false,
    },
    signal,
    new Date('2028-01-03T16:00:00Z'),
  )
}
