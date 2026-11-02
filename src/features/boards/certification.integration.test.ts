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

describe('selectmen certification', () => {
  async function accepted() {
    const id = await filed('2027-03-24')
    await setMeeting(id, '2027-04-14')
    await accept(id, '2027-04-14')
    return id
  }

  it('certification before the decision clock is overdue is clock_not_overdue', async () => {
    const id = await accepted()
    const result = await recordSelectmenCertification(
      handle.db,
      world.staff,
      {
        applicationId: id,
        requestedOn: d('2027-06-18'),
        outcome: 'certified',
        decidedOn: d('2027-06-20'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'clock_not_overdue' })
  })

  it('certified moves the application to decided with substep certified_by_selectmen', async () => {
    const id = await accepted()
    const result = await recordSelectmenCertification(
      handle.db,
      world.staff,
      {
        applicationId: id,
        requestedOn: d('2027-06-19'),
        outcome: 'certified',
        decidedOn: d('2027-06-25'),
      },
      signal,
    )
    expect(result.ok).toBe(true)
    const [app] = await handle.db.select().from(applications).where(eq(applications.id, id))
    expect(app).toMatchObject({
      state: 'decided',
      substep: 'certified_by_selectmen',
      decidedOn: '2027-06-25',
    })
  })

  it('refused keeps the state', async () => {
    const id = await accepted()
    const result = await recordSelectmenCertification(
      handle.db,
      world.staff,
      { applicationId: id, requestedOn: d('2027-06-19'), outcome: 'refused' },
      signal,
    )
    expect(result.ok).toBe(true)
    const [app] = await handle.db.select().from(applications).where(eq(applications.id, id))
    expect(app?.state).toBe('under_review')
  })

  it('reviewer certification is forbidden', async () => {
    const id = await accepted()
    const result = await recordSelectmenCertification(
      handle.db,
      world.reviewer,
      { applicationId: id, requestedOn: d('2027-06-19'), outcome: 'refused' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})
