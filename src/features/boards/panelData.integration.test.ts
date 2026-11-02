import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAcceptanceMeeting } from '@/features/boards/acceptance'
import { scheduleMeeting } from '@/features/boards/meetings'
import { loadBoardPanel } from '@/features/boards/panelData'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
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

describe('loadBoardPanel', () => {
  it('staff with full record access get the panel', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    expect(await loadBoardPanel(handle.db, world.staff, id, signal)).toMatchObject({
      applicationId: id,
    })
  })

  it('a reviewer gets nothing', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    expect(await loadBoardPanel(handle.db, world.reviewer, id, signal)).toBeNull()
  })

  it('the applicant gets nothing', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    expect(await loadBoardPanel(handle.db, world.applicant, id, signal)).toBeNull()
  })
})

describe('meeting choices', () => {
  it('past meetings are not offered, the nearest comes first, and the set meeting is the vote meeting', async () => {
    await scheduleMeeting(
      handle.db,
      world.staff,
      { board: 'planning_board', meetingDate: '2025-01-08' as CivilDate, kind: 'regular' },
      signal,
    )
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    const meetings = await handle.db.query.boardMeetings.findMany()
    const april = meetings.find((m) => m.meetingDate === '2027-04-14')
    await setAcceptanceMeeting(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: april?.id ?? '' },
      signal,
    )
    const panel = await loadBoardPanel(handle.db, world.staff, id, signal)
    expect(panel?.meetings.map((m) => m.text)).not.toContain('January 8, 2025, regular meeting')
    expect(panel?.meetings[0]?.text).toBe('March 10, 2027, regular meeting')
    expect(panel).toMatchObject({ acceptanceMeetingId: april?.id, acceptanceDate: '2027-04-14' })
    const hearings = await loadApplicationHearingsPanel(handle.db, world.staff, id, signal)
    expect(hearings?.scheduleMeetings.map((m) => m.text)).not.toContain('January 8, 2025')
  })
})
