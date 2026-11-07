import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAcceptanceMeeting } from '@/features/boards/acceptance'
import { recordDesDetermination } from '@/features/boards/des500'
import { scheduleMeeting } from '@/features/boards/meetings'
import { loadBoardPanel } from '@/features/boards/panelData'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import {
  type BoardWorld,
  publishRegionalContacts,
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
    const refused = await setAcceptanceMeeting(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: special.ok ? special.value.meetingId : '' },
      signal,
    )
    expect(refused.ok ? null : refused.error).toMatchObject({ filedTooLate: {} })
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
