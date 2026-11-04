import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listMeetingTable } from '@/features/boards/meetingList'
import { readMeetingListView } from '@/features/boards/meetingListParams'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/minio'

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
    const view = readMeetingListView({})
    const page = await listMeetingTable(
      handle.db,
      world.staff,
      { ...view, today: '2027-01-04', limit: 50, offset: 0 },
      signal,
    )
    const row = page?.rows.find((r) => r.id === made.meetingId)
    expect(row?.hearings).toBe(1)
  })
})
