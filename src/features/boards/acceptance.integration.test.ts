import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks } from '@/db/schema'
import { summarizeApplications } from '@/features/applications/recordSource'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { boardSettingsDefault } from '@/features/boards/boardSettings'
import { recordSelectmenCertification } from '@/features/boards/certification'
import { scheduleMeeting } from '@/features/boards/meetings'
import { activeBoards } from '@/features/boards/townBoards'
import { adjustClock } from '@/features/clocks/adjustClock'
import {
  type BoardWorld,
  boardIdOf,
  boardIdSql,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueFixtureList } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
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
    where: (m, { and, eq: equals }) =>
      and(equals(m.meetingDate, date), equals(m.boardId, boardIdSql(board))),
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

async function clockOf(applicationId: string, ruleKey: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.find((c) => c.ruleKey === ruleKey && c.status !== 'superseded')
}

describe('setAcceptanceMeeting', () => {
  it('filed 2027-03-24 may be accepted at 2027-04-14', async () => {
    const id = await filed('2027-03-24')
    expect(await setMeeting(id, '2027-04-14')).toEqual({
      ok: true,
      value: { lastFilingDay: '2027-03-24' },
    })
    const lead = await clockOf(id, 'nh.pb.filing_lead')
    expect(lead).toMatchObject({ status: 'met', metOn: '2027-03-24', currentDue: '2027-03-24' })
  })

  it('filed 2027-03-25 is filedTooLate with earliest meeting 2027-04-28', async () => {
    const id = await filed('2027-03-25')
    expect(await setMeeting(id, '2027-04-14')).toEqual({
      ok: false,
      error: { filedTooLate: { lastFilingDay: '2027-03-24', earliestMeeting: '2027-04-28' } },
    })
    expect(await clockOf(id, 'nh.pb.filing_lead')).toBeUndefined()
  })

  it('town lead of 14 lets 2027-03-31 make 2027-04-14', async () => {
    const defaults = boardSettingsDefault(await activeBoards(handle.db))
    const planningId = await boardIdOf(handle.db, 'planning_board')
    await saveAndPublish(handle.db, world.admin, 'board_settings', 'default', {
      ...defaults,
      boards: defaults.boards.map((b) =>
        b.boardId === planningId
          ? {
              ...b,
              filingLeadDays: 14,
              filingLeadAdoption: { adoptingAuthority: 'Planning Board', adoptedOn: '2027-01-12' },
            }
          : b,
      ),
    })
    const id = await filed('2027-03-31')
    expect(await setMeeting(id, '2027-04-14')).toEqual({
      ok: true,
      value: { lastFilingDay: '2027-03-31' },
    })
    expect((await clockOf(id, 'nh.pb.filing_lead'))?.source).toBe('town_setting')
  })

  it('a town rule setting of 14 days is the lead when board settings leave it blank', async () => {
    await saveAndPublish(handle.db, world.admin, 'town_rule_setting', 'nh.pb.filing_lead', {
      ruleKey: 'nh.pb.filing_lead',
      value: 14,
      adoptingAuthority: 'Planning Board',
      adoptedOn: '2027-01-12',
    })
    const id = await filed('2027-03-31')
    expect(await setMeeting(id, '2027-04-14')).toEqual({
      ok: true,
      value: { lastFilingDay: '2027-03-31' },
    })
    expect(await clockOf(id, 'nh.pb.filing_lead')).toMatchObject({
      source: 'town_setting',
      lengthValue: 14,
      currentDue: '2027-03-31',
    })
  })

  it('zba meeting for a planning board application is wrong_board', async () => {
    const id = await filed('2027-03-24')
    expect(await setMeeting(id, '2027-04-15', 'zba')).toEqual({ ok: false, error: 'wrong_board' })
  })

  it('a cancelled meeting is meeting_cancelled', async () => {
    const id = await filed('2027-03-24')
    const meetingId = await meetingIdOn('2027-04-14')
    await handle.db.execute(
      (await import('drizzle-orm'))
        .sql`update board_meetings set status = 'cancelled' where id = ${meetingId}`,
    )
    expect(await setMeeting(id, '2027-04-14')).toEqual({ ok: false, error: 'meeting_cancelled' })
  })

  it('setting the meeting again supersedes the filing clock', async () => {
    const id = await filed('2027-03-24')
    await setMeeting(id, '2027-04-14')
    await setMeeting(id, '2027-04-28')
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    const leads = rows.filter((c) => c.ruleKey === 'nh.pb.filing_lead')
    expect(leads.map((c) => c.status).sort()).toEqual(['met', 'superseded'])
  })

  it('reviewer setting the meeting is forbidden', async () => {
    const id = await filed('2027-03-24')
    const result = await setAcceptanceMeeting(
      handle.db,
      world.reviewer,
      { applicationId: id, meetingId: await meetingIdOn('2027-04-14') },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})
