import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hearings } from '@/db/schema'
import { setAcceptanceMeeting } from '@/features/boards/acceptance'
import { recordDesDetermination } from '@/features/boards/des500'
import { scheduleMeeting } from '@/features/boards/meetings'
import { loadBoardPanel } from '@/features/boards/panelData'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { scheduleHearing } from '@/features/hearings/hearings'
import { townToday } from '@/features/town/today'
import {
  type BoardWorld,
  publishRegionalContacts,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueFixtureList } from '@/test/listFixtures'
import { addDays, type CivilDate } from '@/types/civilDate'

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

describe('meetings the application was filed too late for', () => {
  it('marks the same meetings that setting the acceptance meeting refuses', async () => {
    const special = await scheduleMeeting(
      handle.db,
      world.staff,
      { board: 'planning_board', meetingDate: '2027-04-07' as CivilDate, kind: 'special' },
      signal,
    )
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    const panel = await loadBoardPanel(handle.db, world.staff, id, signal)
    const byDate = new Map(panel?.meetings.map((m) => [m.date, m.filedInTime]))
    expect(byDate.get('2027-04-07')).toBe(false)
    expect(byDate.get('2027-04-14')).toBe(true)
    const hearings = await loadApplicationHearingsPanel(handle.db, world.staff, id, signal)
    const scheduler = new Map(hearings?.scheduleMeetings.map((m) => [m.date, m.filedInTime]))
    expect(scheduler.get('2027-04-07')).toBe(false)
    expect(scheduler.get('2027-04-14')).toBe(true)
    const refused = await setAcceptanceMeeting(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: special.ok ? special.value.meetingId : '' },
      signal,
    )
    expect(refused.ok ? null : refused.error).toMatchObject({ filedTooLate: {} })
  })
})

describe('meetings too soon to mail notice for', () => {
  it('marks a near meeting too soon unless its hearing is already properly noticed', async () => {
    const today = await townToday(handle.db, new Date(), signal)
    const meetingOn = async (days: number) => {
      const made = await scheduleMeeting(
        handle.db,
        world.staff,
        { board: 'planning_board', meetingDate: addDays(today, days), kind: 'special' },
        signal,
      )
      return made.ok ? made.value.meetingId : ''
    }
    const noticed = await meetingOn(3)
    await meetingOn(5)
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, addDays(today, -40))
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'no', municipalityKeys: [] },
      signal,
    )
    await recordDesDetermination(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'not_applicable', reason: 'No water body anywhere near' },
      signal,
    )
    await issueFixtureList(handle.db, world, id, addDays(today, -40))
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: noticed, kind: 'submission_and_hearing' },
      signal,
    )
    expect(scheduled.ok ? 'ok' : JSON.stringify(scheduled.error)).toBe('ok')
    await handle.db
      .update(hearings)
      .set({ properlyNoticedAt: new Date() })
      .where(eq(hearings.applicationId, id))
    const panel = await loadBoardPanel(handle.db, world.staff, id, signal)
    const byDate = new Map(panel?.meetings.map((m) => [m.date, m.noticeable]))
    expect(byDate.get(addDays(today, 3))).toBe(true)
    expect(byDate.get(addDays(today, 5))).toBe(false)
  })
})

describe('issued list currency', () => {
  it('an issued list reads as out of date after a determination changes', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    await issueFixtureList(handle.db, world, id, '2027-03-24')
    await recordDesDetermination(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'not_applicable', reason: 'No water body anywhere near' },
      signal,
    )
    const panel = await loadBoardPanel(handle.db, world.staff, id, signal)
    expect(panel?.lists[0]?.statusText).toBe('Issued, out of date. Draw and issue a new list.')
  })
})

describe('regional impact summary', () => {
  it('names the affected municipalities in a sentence', async () => {
    await publishRegionalContacts(handle.db, world)
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    const recorded = await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'yes', municipalityKeys: ['pine_river', 'dunmore'] },
      signal,
    )
    expect(recorded.ok).toBe(true)
    const panel = await loadBoardPanel(handle.db, world.staff, id, signal)
    expect(panel?.regional.summary).toBe(
      'Regional impact: yes. Affected municipalities: Town of Dunmore and Town of Pine River.',
    )
  })
})
