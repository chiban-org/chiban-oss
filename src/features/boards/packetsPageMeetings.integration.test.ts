import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardMeetings, boardPackets } from '@/db/schema'
import { loadPacketsPage } from '@/features/boards/packetsPage'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { packetMeeting } from '@/test/packetFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    pbMeetings: ['2027-03-10', '2027-04-14', '2027-04-28', '2027-05-12'],
    zbaMeetings: ['2027-04-15'],
  })
})
afterEach(async () => {
  await handle.drop()
})

describe('packet meeting choice', () => {
  it('offers scheduled meetings that have no packet yet, upcoming first, then past', async () => {
    const withPacket = await packetMeeting(handle.db, 'planning_board', '2027-04-14')
    await handle.db.insert(boardPackets).values({
      title: 'April',
      board: 'planning_board',
      meetingDate: '2027-04-14',
      meetingId: withPacket,
      createdBy: world.staff.userId,
    })
    await handle.db
      .update(boardMeetings)
      .set({ status: 'cancelled', cancelReason: 'Snow' })
      .where(eq(boardMeetings.meetingDate, '2027-04-28'))
    const page = await loadPacketsPage(
      handle.db,
      world.staff,
      signal,
      new Date('2027-04-01T16:00:00Z'),
    )
    if (!page.ok) throw new Error(page.error)
    expect(page.value.meetings.map((m) => m.label)).toEqual([
      'Zoning Board of Adjustment, April 15, 2027',
      'Planning Board, May 12, 2027',
      'Planning Board, March 10, 2027 (already held)',
    ])
    expect(page.value.meetings[0]?.id).toBe(await packetMeeting(handle.db, 'zba', '2027-04-15'))
  })
})
