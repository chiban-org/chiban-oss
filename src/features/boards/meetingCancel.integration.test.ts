import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cancelMeeting } from '@/features/boards/meetings'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

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

async function aprilMeetingId(): Promise<string> {
  const [meeting] = await handle.db.query.boardMeetings.findMany({
    where: (m, { eq: equals }) => equals(m.meetingDate, '2027-04-14'),
  })
  return meeting?.id ?? ''
}

describe('cancelling a meeting', () => {
  it('a meeting that has already taken place cannot be cancelled', async () => {
    const result = await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId: await aprilMeetingId(), reason: 'Quorum not available' },
      signal,
      new Date('2027-04-15T16:00:00Z'),
    )
    expect(result).toEqual({ ok: false, error: 'meeting_past' })
  })

  it('a meeting can still be cancelled on its own day', async () => {
    const result = await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId: await aprilMeetingId(), reason: 'Quorum not available' },
      signal,
      new Date('2027-04-14T16:00:00Z'),
    )
    expect(result.ok).toBe(true)
  })

  it('a cancelled meeting cannot be cancelled again', async () => {
    const input = { meetingId: await aprilMeetingId(), reason: 'Quorum not available' }
    await cancelMeeting(handle.db, world.staff, input, signal)
    expect(await cancelMeeting(handle.db, world.staff, input, signal)).toEqual({
      ok: false,
      error: 'already_cancelled',
    })
  })
})
