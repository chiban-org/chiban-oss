import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addAgendaItem,
  buildAgenda,
  moveAgendaItem,
  publishAgenda,
  removeAgendaItem,
  reopenAgenda,
} from '@/features/agendas/agendas'
import { cancelMeeting } from '@/features/boards/meetings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
const PAST = '2020-01-08'
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { pbMeetings: ['2027-04-14', PAST] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function meetingOn(date: string): Promise<string> {
  const [meeting] = await handle.db.query.boardMeetings.findMany({
    where: (m, { eq: equals }) => equals(m.meetingDate, date),
  })
  return meeting?.id ?? ''
}

async function addMinutes(meetingId: string) {
  return await addAgendaItem(
    handle.db,
    world.staff,
    { meetingId, kind: 'minutes_approval', title: 'Approve the March minutes' },
    signal,
  )
}

const REFUSED = { ok: false, error: 'cancelled_meeting' }

describe('agenda of a cancelled meeting', () => {
  it('refuses building, adding, moving, removing and publishing', async () => {
    const meetingId = await meetingOn('2027-04-14')
    const added = await addMinutes(meetingId)
    if (!added.ok) throw new Error(added.error)
    const cancelled = await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId, reason: 'Quorum not available' },
      signal,
    )
    expect(cancelled.ok).toBe(true)
    expect(await buildAgenda(handle.db, world.staff, meetingId, signal)).toEqual(REFUSED)
    expect(await addMinutes(meetingId)).toEqual(REFUSED)
    expect(
      await moveAgendaItem(
        handle.db,
        world.staff,
        { itemId: added.value.itemId, toPosition: 0 },
        signal,
      ),
    ).toEqual(REFUSED)
    expect(await removeAgendaItem(handle.db, world.staff, added.value.itemId, signal)).toEqual(
      REFUSED,
    )
    expect(await publishAgenda(handle.db, store, world.staff, meetingId, signal)).toEqual(REFUSED)
  })

  it('refuses reopening a published agenda once the meeting is cancelled', async () => {
    const meetingId = await meetingOn('2027-04-14')
    await addMinutes(meetingId)
    const published = await publishAgenda(handle.db, store, world.staff, meetingId, signal)
    expect(published.ok).toBe(true)
    await cancelMeeting(handle.db, world.staff, { meetingId, reason: 'Snow' }, signal)
    expect(await reopenAgenda(handle.db, world.staff, meetingId, signal)).toEqual(REFUSED)
  })
})

describe('agenda of a past meeting', () => {
  it('stays open to correction: hearings, items and publishing are allowed', async () => {
    const meetingId = await meetingOn(PAST)
    expect((await buildAgenda(handle.db, world.staff, meetingId, signal)).ok).toBe(true)
    expect((await addMinutes(meetingId)).ok).toBe(true)
    expect((await publishAgenda(handle.db, store, world.staff, meetingId, signal)).ok).toBe(true)
  })
})
