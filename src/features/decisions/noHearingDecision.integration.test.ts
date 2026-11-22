import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, boardDecisions, hearings, noticeSets } from '@/db/schema'
import { type RecordDecisionInput, recordDecision } from '@/features/decisions/recordDecision'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { setActivePackForTest } from '@/features/packs/registry'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdSql,
  PB_MEETINGS,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES } from '@/test/hearingFixtures'
import { XX_OPTIONAL_HEARING, XX_PB_SUBDIVISION_KEY } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'
import { err } from '@/types/result'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const PB_MEETING_DATE = '2027-04-14'
const ZBA_MEETING_DATE = '2027-04-15'
const BEFORE_RECEIPT_MEETING = '2027-02-24'
const PAST_MEETING_BEFORE_RECEIPT = '2026-02-18'
const PAST_MEETING_AFTER_RECEIPT = '2026-03-18'
let handle: TestDb
let world: BoardWorld

async function meetingOn(date: string, board: 'planning_board' | 'zba'): Promise<string> {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: same }) =>
      and(same(m.meetingDate, date), same(m.boardId, boardIdSql(board))),
  })
  return rows[0]?.id ?? ''
}

async function applicationUnderReview(typeKey: string): Promise<string> {
  const applicationId = await submitBoardApplication(handle.db, world, typeKey, '2027-03-02')
  await handle.db
    .update(applications)
    .set({ state: 'under_review' })
    .where(eq(applications.id, applicationId))
  return applicationId
}

function noHearingInput(
  applicationId: string,
  meetingId: string,
  overrides: Partial<RecordDecisionInput> = {},
): RecordDecisionInput {
  return {
    applicationId,
    hearingId: null,
    meetingId,
    votedOn: d(PB_MEETING_DATE),
    outcome: 'approved',
    motion: 'Move to approve as presented.',
    votes: FIXTURE_VOTES,
    findings: 'The proposal meets each criterion of the ordinance.',
    ...overrides,
  }
}

async function decisionRows(applicationId: string) {
  return await handle.db
    .select()
    .from(boardDecisions)
    .where(eq(boardDecisions.applicationId, applicationId))
}

async function scheduledHearingFor(applicationId: string, meetingId: string): Promise<void> {
  const [set] = await handle.db
    .insert(noticeSets)
    .values({
      subjectKind: 'hearing',
      subjectId: applicationId,
      applicationId,
      anchorDate: PB_MEETING_DATE,
    })
    .returning({ id: noticeSets.id })
  await handle.db.insert(hearings).values({
    applicationId,
    meetingId,
    kind: 'public_hearing',
    status: 'scheduled',
    noticeSetId: set?.id ?? '',
    createdBy: world.staff.userId,
  })
}

async function record(input: RecordDecisionInput) {
  return await recordDecision(handle.db, world.staff, input, signal, BOARD_FIXTURE_NOW)
}

afterEach(async () => {
  await handle.drop()
})

describe('a classification whose hearing is optional', () => {
  beforeAll(() => {
    setActivePackForTest(XX_OPTIONAL_HEARING)
  })
  afterAll(() => {
    setActivePackForTest(null)
  })
  beforeEach(async () => {
    handle = await makeTestDb()
    world = await setupBoardWorld(handle.db, {
      pbMeetings: [
        ...PB_MEETINGS,
        BEFORE_RECEIPT_MEETING,
        PAST_MEETING_BEFORE_RECEIPT,
        PAST_MEETING_AFTER_RECEIPT,
      ],
      zbaMeetings: [ZBA_MEETING_DATE],
      pack: XX_OPTIONAL_HEARING,
      classificationKey: XX_PB_SUBDIVISION_KEY,
    })
  })

  it('records a decision at a meeting with no hearing', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    const meetingId = await meetingOn(PB_MEETING_DATE, 'planning_board')
    const result = await record(noHearingInput(applicationId, meetingId))
    expect(result).toEqual({ ok: true, value: { decisionId: expect.any(String) } })
    const [row] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.applicationId, applicationId))
    expect(row?.hearingId).toBeNull()
    expect(row?.meetingId).toBe(meetingId)
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(app?.state).toBe('decided')
  })

  it('refuses a second decision without a hearing', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    const meetingId = await meetingOn(PB_MEETING_DATE, 'planning_board')
    expect((await record(noHearingInput(applicationId, meetingId))).ok).toBe(true)
    expect(await record(noHearingInput(applicationId, meetingId))).toEqual(err('invalid_state'))
  })

  it('refuses a meeting of another board', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    const meetingId = await meetingOn(ZBA_MEETING_DATE, 'zba')
    expect(await record(noHearingInput(applicationId, meetingId))).toEqual(err('not_found'))
  })

  it('refuses a vote dated before the meeting', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    const meetingId = await meetingOn(PB_MEETING_DATE, 'planning_board')
    expect(
      await record(noHearingInput(applicationId, meetingId, { votedOn: d('2027-04-13') })),
    ).toEqual(err('before_meeting'))
  })

  it('refuses a vote dated before the application was received', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    const meetingId = await meetingOn(BEFORE_RECEIPT_MEETING, 'planning_board')
    expect(
      await record(
        noHearingInput(applicationId, meetingId, { votedOn: d(BEFORE_RECEIPT_MEETING) }),
      ),
    ).toEqual(err('before_receipt'))
    expect(await decisionRows(applicationId)).toEqual([])
  })

  it('refuses a vote dated before the board accepted the application', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    await handle.db
      .update(applications)
      .set({ completedDate: '2027-04-20' })
      .where(eq(applications.id, applicationId))
    const meetingId = await meetingOn(PB_MEETING_DATE, 'planning_board')
    expect(await record(noHearingInput(applicationId, meetingId))).toEqual(err('before_acceptance'))
    expect(await decisionRows(applicationId)).toEqual([])
  })

  it('refuses a vote while a hearing is scheduled', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    const meetingId = await meetingOn(PB_MEETING_DATE, 'planning_board')
    await scheduledHearingFor(applicationId, await meetingOn('2027-05-12', 'planning_board'))
    expect(await record(noHearingInput(applicationId, meetingId))).toEqual(err('hearing_scheduled'))
    expect(await decisionRows(applicationId)).toEqual([])
  })

  it('offers no meeting dated before the application was received', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    await handle.db
      .update(applications)
      .set({ receivedDate: '2026-03-01' })
      .where(eq(applications.id, applicationId))
    const panel = await loadApplicationHearingsPanel(handle.db, world.staff, applicationId, signal)
    const offered = panel?.noHearing?.meetings.map((m) => m.id) ?? []
    expect(offered).toContain(await meetingOn(PAST_MEETING_AFTER_RECEIPT, 'planning_board'))
    expect(offered).not.toContain(await meetingOn(PAST_MEETING_BEFORE_RECEIPT, 'planning_board'))
  })

  it('offers no meeting dated before the board accepted the application', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    await handle.db
      .update(applications)
      .set({ receivedDate: '2026-01-05', completedDate: '2026-03-01' })
      .where(eq(applications.id, applicationId))
    const panel = await loadApplicationHearingsPanel(handle.db, world.staff, applicationId, signal)
    const offered = panel?.noHearing?.meetings.map((m) => m.id) ?? []
    expect(offered).toContain(await meetingOn(PAST_MEETING_AFTER_RECEIPT, 'planning_board'))
    expect(offered).not.toContain(await meetingOn(PAST_MEETING_BEFORE_RECEIPT, 'planning_board'))
  })

  it('offers the form on the application panel until a decision is recorded', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    const panel = await loadApplicationHearingsPanel(handle.db, world.staff, applicationId, signal)
    expect(panel?.noHearing).not.toBeNull()
    const meetingId = await meetingOn(PB_MEETING_DATE, 'planning_board')
    expect((await record(noHearingInput(applicationId, meetingId))).ok).toBe(true)
    const after = await loadApplicationHearingsPanel(handle.db, world.staff, applicationId, signal)
    expect(after?.noHearing).toBeNull()
  })

  it('asks for a meeting when none is given', async () => {
    const applicationId = await applicationUnderReview(world.zbaTypeKey)
    expect(await record(noHearingInput(applicationId, '', { meetingId: undefined }))).toEqual(
      err('meeting_required'),
    )
  })
})

describe('a classification whose hearing is required', () => {
  beforeEach(async () => {
    handle = await makeTestDb()
    world = await setupBoardWorld(handle.db)
  })

  it('still requires a hearing under NH', async () => {
    const applicationId = await applicationUnderReview(world.pbTypeKey)
    const meetingId = await meetingOn(PB_MEETING_DATE, 'planning_board')
    expect(await record(noHearingInput(applicationId, meetingId))).toEqual(err('hearing_required'))
    const panel = await loadApplicationHearingsPanel(handle.db, world.staff, applicationId, signal)
    expect(panel?.noHearing).toBeNull()
  })
})
