import { ME_PACK } from '@packs/me'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import type { Recipient } from '@/features/abutters/resolution'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { fileDecision } from '@/features/decisions/fileDecision'
import { recordDecision } from '@/features/decisions/recordDecision'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdSql,
  boardTypeBody,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { readyToFile } from '@/test/deliveryFixtures'
import { FIXTURE_VOTES } from '@/test/hearingFixtures'
import { HEARING_MEETING, pbMeetingOn } from '@/test/maineSubdivisionFixtures'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate

export const BOA_VARIANCE_TYPE = 'BOA'
export const BOA_ADMIN_TYPE = 'BAA'
export const ME_PERMIT_TYPE = 'MEBP'
export const BOA_RECEIVED = '2027-03-02'
export const BOA_HEARING = '2027-04-15'
export const BOA_MEETINGS = ['2027-03-25', BOA_HEARING]

const PERMIT_BINDINGS =
  ME_PACK.manifest.classifications.find((c) => c.key === 'me.building_permit')?.mandatoryRuleKeys ??
  []

export async function publishBoardOfAppealsTypes(db: Db, world: BoardWorld): Promise<void> {
  const types = [
    ['me.boa_variance', BOA_VARIANCE_TYPE],
    ['me.boa_admin_appeal', BOA_ADMIN_TYPE],
  ] as const
  for (const [classification, key] of types) {
    await saveAndPublish(
      db,
      world.admin,
      'application_type',
      key,
      boardTypeBody(classification, key, key, {}, ME_PACK),
    )
  }
  await saveAndPublish(
    db,
    world.admin,
    'application_type',
    ME_PERMIT_TYPE,
    appTypeBody({
      key: ME_PERMIT_TYPE,
      prefix: 'MB',
      classification: 'me.building_permit',
      bindings: PERMIT_BINDINGS,
      workflow: { allowsDirectIssue: true, substeps: [], closesOn: 'certificate_of_occupancy' },
    }),
  )
}

export async function zbaMeetingOn(db: Db, date: string): Promise<string> {
  const rows = await db.query.boardMeetings.findMany({
    where: (m, { and: both, eq: same }) =>
      both(same(m.meetingDate, date), same(m.boardId, boardIdSql('zba'))),
  })
  const id = rows[0]?.id
  if (id === undefined) throw new AppError(ErrorIds.DB_INVARIANT, `no meeting on ${date}`)
  return id
}

export function boardOfAppealsRecipients(): Recipient[] {
  return [
    recipient(1),
    recipient(2),
    recipient(3, ['applicant']),
    recipient(4, ['planning_board']),
    recipient(5, ['municipal_officers']),
  ]
}

export async function scheduleBoaHearing(db: Db, world: BoardWorld, applicationId: string) {
  const meetingId = await zbaMeetingOn(db, BOA_HEARING)
  const scheduled = await scheduleHearing(
    db,
    world.staff,
    { applicationId, meetingId, kind: 'public_hearing' },
    signal,
  )
  if (!scheduled.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `schedule: ${JSON.stringify(scheduled.error)}`)
  }
  const [hearing] = await db.query.hearings.findMany({
    where: (h, { eq: same }) => same(h.id, scheduled.value.hearingId),
  })
  if (hearing === undefined) throw new AppError(ErrorIds.DB_INVARIANT, 'no hearing row')
  return { applicationId, hearingId: hearing.id, noticeSetId: hearing.noticeSetId }
}

export async function scheduledBoaHearing(db: Db, world: BoardWorld, typeKey: string) {
  const applicationId = await submitBoardApplication(db, world, typeKey, BOA_RECEIVED)
  await issueListWithRecipients(db, world, applicationId, boardOfAppealsRecipients())
  return await scheduleBoaHearing(db, world, applicationId)
}

export async function decidedBoa(
  db: Db,
  world: BoardWorld,
  options: { typeKey?: string; outcome?: 'approved' | 'denied' } = {},
) {
  const hearing = await scheduledBoaHearing(db, world, options.typeKey ?? BOA_VARIANCE_TYPE)
  const now = new Date(`${BOA_HEARING}T16:00:00Z`)
  await proveEverything(db, world, hearing.applicationId, hearing.noticeSetId, d('2027-04-01'), now)
  const noticed = await markProperlyNoticed(db, world.staff, hearing.hearingId, signal, now)
  if (!noticed.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'not noticed')
  const held = await markHearingHeld(
    db,
    world.staff,
    { hearingId: hearing.hearingId, heldOn: d(BOA_HEARING) },
    signal,
    now,
  )
  if (!held.ok) throw new AppError(ErrorIds.DB_INVARIANT, `not held: ${held.error}`)
  const decided = await recordDecision(
    db,
    world.staff,
    {
      applicationId: hearing.applicationId,
      hearingId: hearing.hearingId,
      votedOn: d(BOA_HEARING),
      outcome: options.outcome ?? 'approved',
      motion: 'Move to grant the variance as presented.',
      votes: FIXTURE_VOTES,
      findings: 'Strict application of the ordinance would cause undue hardship.',
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!decided.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `decision: ${JSON.stringify(decided.error)}`)
  }
  return { applicationId: hearing.applicationId, decisionId: decided.value.decisionId }
}

export async function incompleteAtBoard(db: Db, world: BoardWorld, applicationId: string) {
  const meetingId = await zbaMeetingOn(db, '2027-03-25')
  const set = await setAcceptanceMeeting(db, world.staff, { applicationId, meetingId }, signal)
  if (!set.ok) throw new AppError(ErrorIds.DB_INVARIANT, `acceptance: ${JSON.stringify(set.error)}`)
  const voted = await recordCompletenessVote(
    db,
    world.staff,
    {
      applicationId,
      meetingId,
      votedOn: d('2027-03-25'),
      outcome: 'not_accepted',
      reason: 'The application lacks the deed reference.',
    },
    signal,
    new Date('2027-03-25T16:00:00Z'),
  )
  if (!voted.ok) throw new AppError(ErrorIds.DB_INVARIANT, `vote: ${JSON.stringify(voted.error)}`)
}

export async function deniedSubdivision(
  db: Db,
  world: BoardWorld,
  applicationId: string,
  significant: boolean,
) {
  const decided = await recordDecision(
    db,
    world.staff,
    {
      applicationId,
      hearingId: null,
      meetingId: await pbMeetingOn(db, HEARING_MEETING),
      votedOn: d(HEARING_MEETING),
      outcome: 'denied',
      motion: 'Move to deny the subdivision.',
      votes: FIXTURE_VOTES,
      findings: 'The subdivision does not meet the ordinance criteria.',
      significant,
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!decided.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `decision: ${JSON.stringify(decided.error)}`)
  }
  return { applicationId, decisionId: decided.value.decisionId }
}

export async function approvedLastSubdivision(
  db: Db,
  world: BoardWorld,
  applicationId: string,
  on: string,
) {
  const decided = await recordDecision(
    db,
    world.staff,
    {
      applicationId,
      hearingId: null,
      meetingId: await pbMeetingOn(db, on),
      votedOn: d(on),
      outcome: 'approved',
      motion: 'Move to approve the subdivision as presented.',
      votes: FIXTURE_VOTES,
      findings: 'The subdivision meets each criterion of the ordinance.',
      significant: false,
      finalMunicipalApproval: true,
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!decided.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, `decision: ${JSON.stringify(decided.error)}`)
  }
}

export async function filedOn(
  db: Db,
  world: BoardWorld,
  made: { applicationId: string; decisionId: string },
  on: string,
) {
  const { minutesId } = await readyToFile(db, made)
  const filed = await fileDecision(
    db,
    world.staff,
    { decisionId: made.decisionId, filedOn: d(on), minutesDocumentId: minutesId },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!filed.ok) throw new AppError(ErrorIds.DB_INVARIANT, `file: ${JSON.stringify(filed.error)}`)
}
