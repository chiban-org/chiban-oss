import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listMeetingTable } from '@/features/boards/meetingList'
import { readMeetingListView } from '@/features/boards/meetingListParams'
import { activeBoards } from '@/features/boards/townBoards'
import { type BoardWorld, scheduleMeetings, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'

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
})
