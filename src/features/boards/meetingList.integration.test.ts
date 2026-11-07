import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { archiveBoard, createBoard } from '@/features/boards/boardAdmin'
import { listMeetingTable, meetingFilterBoards } from '@/features/boards/meetingList'
import { readMeetingListView } from '@/features/boards/meetingListParams'
import { activeBoards } from '@/features/boards/townBoards'
import { type BoardWorld, scheduleMeetings, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'
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

describe('the meeting table', () => {
  it('counts the hearings scheduled at each meeting', async () => {
    const { store } = await makeTestStore()
    const made = await decidedZba(handle.db, world, store, { documents: false })
    const boardIds = (await activeBoards(handle.db)).map((b) => b.id)
    const view = readMeetingListView({}, boardIds)
    const page = await listMeetingTable(
      handle.db,
      world.staff,
      { ...view, boardIds, today: '2027-01-04', limit: 50, offset: 0 },
      signal,
    )
    const row = page?.rows.find((r) => r.id === made.meetingId)
    expect(row?.hearings).toBe(1)
  })

  it('sorts the Board column by board name, not by id', async () => {
    await scheduleMeetings(handle.db, world.staff, 'zba', ['2027-02-02'])
    const boardIds = (await activeBoards(handle.db)).map((b) => b.id)
    const names = new Map((await activeBoards(handle.db)).map((b) => [b.id, b.name]))
    const sort = { key: 'board', dir: 'asc' } as const
    const page = await listMeetingTable(
      handle.db,
      world.staff,
      {
        ...readMeetingListView({}, boardIds),
        boardIds,
        sort,
        today: '2027-01-04',
        limit: 50,
        offset: 0,
      },
      signal,
    )
    const ordered = (page?.rows ?? []).map((r) => names.get(r.boardId) ?? '')
    expect(ordered).toEqual(
      [...ordered].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    )
    expect(new Set(ordered).size).toBe(2)
  })

  it('offers archived boards only while they have meetings in the range shown', async () => {
    const made = await createBoard(
      handle.db,
      world.admin,
      { name: 'Old Commission', shortName: 'Old', kind: 'other' },
      signal,
    )
    if (!made.ok) throw new Error('create failed')
    const { scheduleMeeting } = await import('@/features/boards/meetings')
    await scheduleMeeting(
      handle.db,
      world.staff,
      { boardId: made.value.boardId, meetingDate: '2027-01-10' as CivilDate, kind: 'regular' },
      signal,
    )
    const archived = await archiveBoard(
      handle.db,
      world.admin,
      { boardId: made.value.boardId },
      signal,
      new Date('2027-02-01T16:00:00Z'),
    )
    expect(archived.ok).toBe(true)
    const names = async (when: 'upcoming' | 'past') =>
      (await meetingFilterBoards(handle.db, when, '2027-02-01')).map((b) => b.name)
    expect(await names('past')).toContain('Old Commission')
    expect(await names('upcoming')).not.toContain('Old Commission')
    expect(await names('upcoming')).toContain('Alder Pond Planning Board')
  })
})
