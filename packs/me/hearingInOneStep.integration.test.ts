import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, hearings } from '@/db/schema'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { planWork } from '@/features/applications/workPlan'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { loadBoardPanel } from '@/features/boards/panelData'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { scheduleHearing } from '@/features/hearings/hearings'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  BOA_HEARING,
  BOA_MEETINGS,
  BOA_RECEIVED,
  BOA_VARIANCE_TYPE,
  boardOfAppealsRecipients,
  publishBoardOfAppealsTypes,
} from '@/test/maineBoardOfAppealsFixtures'
import { itemsOf } from '@/test/maineSubdivisionFixtures'
import { issueListWithRecipients } from '@/test/noticeFixtures'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const NOTICE_DUE = '2027-04-08'
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: BOA_MEETINGS })
  setActivePackForTest(ME_PACK)
  await publishBoardOfAppealsTypes(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function filedVariance() {
  const applicationId = await submitBoardApplication(
    handle.db,
    world,
    BOA_VARIANCE_TYPE,
    BOA_RECEIVED,
  )
  await issueListWithRecipients(handle.db, world, applicationId, boardOfAppealsRecipients())
  return applicationId
}

describe('a filed Board of Appeals application', () => {
  it('schedules its hearing and its notices in one step', async () => {
    const applicationId = await filedVariance()
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      applicationId,
      new Date(),
      signal,
    )
    const board = await loadBoardPanel(handle.db, world.staff, applicationId, signal)
    if (view === null) throw new Error('no view')
    const plan = planWork(view, board, {
      reviewers: 0,
      abilities: new Set(['set_board_meeting', 'record_board_vote']),
      responsible: null,
    })
    const boardRows = plan.groups.flatMap((g) => g.rows).filter((r) => r.key.startsWith('board.'))
    expect(boardRows).toMatchObject([
      { key: 'board.meeting', task: 'Schedule the hearing', action: { kind: 'set_board_meeting' } },
    ])
    const panel = await loadApplicationHearingsPanel(handle.db, world.staff, applicationId, signal)
    const meeting = panel?.scheduleMeetings.find((m) => m.date === BOA_HEARING)
    if (meeting === undefined) throw new Error('no hearing meeting offered')
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId, meetingId: meeting.id, kind: 'public_hearing' },
      signal,
    )
    if (!scheduled.ok) throw new Error(JSON.stringify(scheduled.error))
    const [hearing] = await handle.db
      .select()
      .from(hearings)
      .where(eq(hearings.id, scheduled.value.hearingId))
    expect(hearing).toMatchObject({ applicationId, meetingId: meeting.id, kind: 'public_hearing' })
    const [app] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(app?.state).toBe('under_review')
    const items = await itemsOf(handle.db, hearing?.noticeSetId ?? '')
    expect(items.length).toBeGreaterThan(0)
    expect(new Set(items.map((i) => i.dueOn))).toEqual(new Set([NOTICE_DUE]))
  })

  it('refuses with a plain reason while the abutter list is not issued', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      BOA_VARIANCE_TYPE,
      BOA_RECEIVED,
    )
    const panel = await loadApplicationHearingsPanel(handle.db, world.staff, applicationId, signal)
    const meeting = panel?.scheduleMeetings.find((m) => m.date === BOA_HEARING)
    if (meeting === undefined) throw new Error('no hearing meeting offered')
    const refused = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId, meetingId: meeting.id, kind: 'public_hearing' },
      signal,
    )
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(boardErrorCopy(refused.error)).toBe(
      'Issue the abutter list before scheduling a hearing.',
    )
  })
})
