import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, boardMeetings, hearings } from '@/db/schema'
import { scheduleMeeting } from '@/features/boards/meetings'
import { loadBoardPanel } from '@/features/boards/panelData'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { scheduleHearing } from '@/features/hearings/hearings'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { recordProof } from '@/features/notices/proofs'
import { townToday } from '@/features/town/today'
import {
  type BoardWorld,
  boardIdOf,
  publishRegionalContacts,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  issueListWithRecipients,
  proofDocument,
  recipient,
  recordDesProximity,
} from '@/test/noticeFixtures'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let today: CivilDate

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  today = await townToday(handle.db, new Date(), signal)
})
afterEach(async () => {
  await handle.drop()
})

async function meetingIn(board: 'planning_board' | 'zba', days: number): Promise<void> {
  const made = await scheduleMeeting(
    handle.db,
    world.staff,
    {
      boardId: await boardIdOf(handle.db, board),
      meetingDate: addDays(today, days),
      kind: 'special',
    },
    signal,
  )
  expect(made.ok).toBe(true)
}

async function noticeable(applicationId: string, days: number[]): Promise<(boolean | undefined)[]> {
  const panel = await loadBoardPanel(handle.db, world.staff, applicationId, signal)
  const byDate = new Map(panel?.meetings.map((m) => [m.date, m.noticeable]))
  return days.map((d) => byDate.get(addDays(today, d)))
}

describe('meetings too soon for every notice the application needs, assuming the stricter notice until regional impact is determined', () => {
  it('holds a Planning Board application with regional impact to the 14-day certified notice', async () => {
    await meetingIn('planning_board', 12)
    await meetingIn('planning_board', 15)
    await publishRegionalContacts(handle.db, world)
    const regional = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      addDays(today, -40),
    )
    const recorded = await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: regional, determination: 'yes', municipalityKeys: ['pine_river'] },
      signal,
    )
    expect(recorded.ok).toBe(true)
    const local = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      addDays(today, -40),
    )
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: local, determination: 'no', municipalityKeys: [] },
      signal,
    )
    const undetermined = await submitBoardApplication(
      handle.db,
      world,
      world.pbTypeKey,
      addDays(today, -40),
    )
    expect(await noticeable(regional, [12, 15])).toEqual([false, true])
    expect(await noticeable(local, [12, 15])).toEqual([true, true])
    expect(await noticeable(undetermined, [12, 15])).toEqual([false, true])
  })

  it('holds a ZBA application without regional impact to its 5-day notice', async () => {
    await meetingIn('zba', 3)
    await meetingIn('zba', 8)
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, addDays(today, -20))
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'no', municipalityKeys: [] },
      signal,
    )
    expect(await noticeable(id, [3, 8])).toEqual([false, true])
  })

  it('keeps marking scheduler meetings too soon once the application is under review', async () => {
    await meetingIn('zba', 3)
    await meetingIn('zba', 8)
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, addDays(today, -20))
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'no', municipalityKeys: [] },
      signal,
    )
    await handle.db
      .update(applications)
      .set({ state: 'under_review' })
      .where(eq(applications.id, id))
    const hearings = await loadApplicationHearingsPanel(handle.db, world.staff, id, signal)
    const byDate = new Map(hearings?.scheduleMeetings.map((m) => [m.date, m.noticeable]))
    expect([byDate.get(addDays(today, 3)), byDate.get(addDays(today, 8))]).toEqual([false, true])
  })

  it('counts a hearing whose proved notices are on time and whose others can still be sent', async () => {
    await meetingIn('planning_board', 12)
    await publishRegionalContacts(handle.db, world)
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, addDays(today, -40))
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'yes', municipalityKeys: ['pine_river'] },
      signal,
    )
    await recordDesProximity(handle.db, world, id, 'not_within')
    await issueListWithRecipients(
      handle.db,
      world,
      id,
      [recipient(1, ['regional_planning_commission']), recipient(2)],
      addDays(today, -40),
    )
    const [meeting] = await handle.db
      .select({ id: boardMeetings.id })
      .from(boardMeetings)
      .where(eq(boardMeetings.meetingDate, addDays(today, 12)))
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: meeting?.id ?? '', kind: 'submission_and_hearing' },
      signal,
    )
    expect(scheduled.ok ? 'ok' : JSON.stringify(scheduled.error)).toBe('ok')
    expect(await noticeable(id, [12])).toEqual([false])
    const [hearing] = await handle.db.select().from(hearings).where(eq(hearings.applicationId, id))
    const status = await noticeStatus(handle.db, hearing?.noticeSetId ?? '', signal)
    const certified = status.items.filter((i) => i.channel === 'certified_mail')
    expect(certified.length).toBeGreaterThan(0)
    const proved = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: certified.map((i) => i.itemId),
        method: 'certified_mail',
        reference: 'RR-0001',
        effectiveOn: addDays(today, -3),
        documentId: await proofDocument(handle.db, world, id),
      },
      signal,
    )
    expect(proved.ok ? 'ok' : JSON.stringify(proved.error)).toBe('ok')
    expect(await noticeable(id, [12])).toEqual([true])
  })
})
