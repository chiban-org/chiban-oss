import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdOf,
  recordNoRegionalImpact,
  scheduleMeetings,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueFixtureList } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('zba submission', () => {
  it('zba submission received 2027-03-02 starts hearing due 2027-04-16 and decision due 2027-05-31', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    const due = Object.fromEntries(rows.map((c) => [c.ruleKey, c.currentDue]))
    expect(due['nh.zba.hearing']).toBe('2027-04-16')
    expect(due['nh.zba.decision']).toBe('2027-05-31')
    expect(due['nh.pb.completeness']).toBeUndefined()
  })

  it('a planning board submission starts the completeness clock and no zba clock', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    expect(rows.map((c) => c.ruleKey)).toEqual(['nh.pb.completeness'])
  })
})

describe('zba hearing opened', () => {
  it('opening the hearing marks the hearing deadline met', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await recordNoRegionalImpact(handle.db, world, id)
    await issueFixtureList(handle.db, world, id, '2027-03-02')
    await scheduleMeetings(handle.db, world.staff, 'zba', ['2027-04-07'])
    const zbaId = await boardIdOf(handle.db, 'zba')
    const meetings = await handle.db.query.boardMeetings.findMany()
    const meetingId = meetings.find((m) => m.boardId === zbaId)?.id ?? ''
    await setAcceptanceMeeting(handle.db, world.staff, { applicationId: id, meetingId }, signal)
    const vote = await recordCompletenessVote(
      handle.db,
      world.staff,
      { applicationId: id, meetingId, votedOn: '2027-04-07' as CivilDate, outcome: 'accepted' },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(vote.ok).toBe(true)
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    expect(rows.find((c) => c.ruleKey === 'nh.zba.hearing')).toMatchObject({
      status: 'met',
      metOn: '2027-04-07',
    })
    expect(rows.find((c) => c.ruleKey === 'nh.zba.decision')?.status).toBe('running')
  })
})
