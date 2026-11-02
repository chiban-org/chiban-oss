import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks } from '@/db/schema'
import { summarizeApplications } from '@/features/applications/recordSource'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettings'
import { recordSelectmenCertification } from '@/features/boards/certification'
import { scheduleMeeting } from '@/features/boards/meetings'
import { adjustClock } from '@/features/clocks/adjustClock'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueFixtureList } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

async function meetingIdOn(date: string, board: 'planning_board' | 'zba' = 'planning_board') {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) => and(equals(m.meetingDate, date), equals(m.board, board)),
  })
  return rows[0]?.id ?? ''
}

async function filed(received: string) {
  const applicationId = await submitBoardApplication(handle.db, world, world.pbTypeKey, received)
  await recordNoRegionalImpact(handle.db, world, applicationId)
  await issueFixtureList(handle.db, world, applicationId, received)
  return applicationId
}

async function setMeeting(
  applicationId: string,
  date: string,
  board: 'planning_board' | 'zba' = 'planning_board',
) {
  return await setAcceptanceMeeting(
    handle.db,
    world.staff,
    { applicationId, meetingId: await meetingIdOn(date, board) },
    signal,
  )
}

async function accept(applicationId: string, meeting: string, votedOn = meeting) {
  return await recordCompletenessVote(
    handle.db,
    world.staff,
    {
      applicationId,
      meetingId: await meetingIdOn(meeting),
      votedOn: d(votedOn),
      outcome: 'accepted',
    },
    signal,
  )
}

async function clockOf(applicationId: string, ruleKey: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === ruleKey && c.status !== 'superseded')
}

describe('recordCompletenessVote', () => {
  it('acceptance on 2027-04-14 starts a 65-day clock due 2027-06-18', async () => {
    const id = await filed('2027-03-24')
    await setMeeting(id, '2027-04-14')
    expect(await accept(id, '2027-04-14')).toEqual({ ok: true, value: undefined })
    expect(await clockOf(id, 'nh.pb.decision')).toMatchObject({
      currentDue: '2027-06-18',
      status: 'running',
    })
    expect(await clockOf(id, 'nh.pb.completeness')).toMatchObject({
      status: 'met',
      metOn: '2027-04-14',
    })
    const [app] = await handle.db.select().from(applications).where(eq(applications.id, id))
    expect(app).toMatchObject({
      state: 'under_review',
      substep: 'hearing',
      completedDate: '2027-04-14',
    })
  })

  it('65-day decision due on Saturday 2027-07-17 does not roll', async () => {
    await scheduleMeeting(
      handle.db,
      world.staff,
      { board: 'planning_board', meetingDate: d('2027-05-13'), kind: 'special' },
      signal,
    )
    const id = await filed('2027-04-20')
    await setMeeting(id, '2027-05-13')
    await accept(id, '2027-05-13')
    expect(await clockOf(id, 'nh.pb.decision')).toMatchObject({
      currentDue: '2027-07-17',
      rolledFrom: null,
    })
  })

  it('applicant-consent extension of 30 days moves 2027-06-18 to 2027-07-18', async () => {
    const id = await filed('2027-03-24')
    await setMeeting(id, '2027-04-14')
    await accept(id, '2027-04-14')
    const clock = await clockOf(id, 'nh.pb.decision')
    const result = await adjustClock(
      handle.db,
      world.staff,
      {
        clockId: clock?.id ?? '',
        kind: 'extension',
        days: 30,
        reason: 'Applicant asked for time',
        applicantConsent: true,
      },
      signal,
    )
    expect(result.ok).toBe(true)
    expect((await clockOf(id, 'nh.pb.decision'))?.currentDue).toBe('2027-07-18')
  })

  it('extension without consent is consent_required', async () => {
    const id = await filed('2027-03-24')
    await setMeeting(id, '2027-04-14')
    await accept(id, '2027-04-14')
    const clock = await clockOf(id, 'nh.pb.decision')
    const result = await adjustClock(
      handle.db,
      world.staff,
      { clockId: clock?.id ?? '', kind: 'extension', days: 30, reason: 'Board wants time' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'consent_required' })
  })

  it('not accepted needs a reason and denies with the closure reason', async () => {
    const id = await filed('2027-03-24')
    await setMeeting(id, '2027-04-14')
    const vote = {
      applicationId: id,
      meetingId: await meetingIdOn('2027-04-14'),
      votedOn: d('2027-04-14'),
      outcome: 'not_accepted' as const,
    }
    expect(await recordCompletenessVote(handle.db, world.staff, vote, signal)).toEqual({
      ok: false,
      error: 'reason_required',
    })
    expect(
      (
        await recordCompletenessVote(
          handle.db,
          world.staff,
          { ...vote, reason: 'Missing the drainage study' },
          signal,
        )
      ).ok,
    ).toBe(true)
    const [app] = await handle.db.select().from(applications).where(eq(applications.id, id))
    expect(app).toMatchObject({ state: 'denied', closureReason: 'not_accepted_incomplete' })
  })

  it('not accepted shows "Not accepted as complete" in public parcel history', async () => {
    const id = await filed('2027-03-24')
    await setMeeting(id, '2027-04-14')
    await recordCompletenessVote(
      handle.db,
      world.staff,
      {
        applicationId: id,
        meetingId: await meetingIdOn('2027-04-14'),
        votedOn: d('2027-04-14'),
        outcome: 'not_accepted',
        reason: 'Missing the drainage study',
      },
      signal,
    )
    const [summary] = await summarizeApplications(handle.db, [id], { kind: 'public' }, signal)
    expect(summary?.status.label).toBe('Not accepted as complete')
  })

  it('no determination blocks acceptance', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    await setMeeting(id, '2027-04-14')
    const result = await accept(id, '2027-04-14')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(JSON.stringify(result.error)).toContain('nh.ri.determination')
  })

  it('regional impact yes accepted at the meeting starts a 95-day clock', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    await recordNoRegionalImpact(handle.db, world, id, 'yes')
    await issueFixtureList(handle.db, world, id, '2027-03-24')
    await setMeeting(id, '2027-04-14')
    await accept(id, '2027-04-14')
    expect((await clockOf(id, 'nh.pb.decision'))?.currentDue).toBe('2027-07-18')
  })

  it('reviewer recording a completeness vote is forbidden', async () => {
    const id = await filed('2027-03-24')
    await setMeeting(id, '2027-04-14')
    const result = await recordCompletenessVote(
      handle.db,
      world.reviewer,
      {
        applicationId: id,
        meetingId: await meetingIdOn('2027-04-14'),
        votedOn: d('2027-04-14'),
        outcome: 'accepted',
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})
