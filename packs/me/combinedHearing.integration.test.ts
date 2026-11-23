import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordCompletenessVote } from '@/features/boards/acceptance'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  clocksOf,
  HEARING_MEETING,
  pbMeetingOn,
  preparedReceipt,
  proveReceipt,
  publishSubdivisionType,
  receivedSubdivision,
} from '@/test/maineSubdivisionFixtures'
import { proveEverything } from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const HELD_NOW = new Date(`${HEARING_MEETING}T16:00:00Z`)
const VOTED_ON = d('2027-04-20')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  setActivePackForTest(ME_PACK)
  await publishSubdivisionType(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function heldCombinedHearing(): Promise<string> {
  const id = await receivedSubdivision(handle.db, world, 'not_within')
  await proveReceipt(handle.db, world, id, await preparedReceipt(handle.db, world, id))
  const meetingId = await pbMeetingOn(handle.db, HEARING_MEETING)
  const scheduled = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId: id, meetingId, kind: 'submission_and_hearing' },
    signal,
  )
  if (!scheduled.ok) throw new Error(`not scheduled: ${JSON.stringify(scheduled.error)}`)
  const { hearingId } = scheduled.value
  const [hearing] = await handle.db.query.hearings.findMany({
    where: (h, { eq }) => eq(h.id, hearingId),
  })
  await proveEverything(handle.db, world, id, hearing?.noticeSetId ?? '', d('2027-04-01'), HELD_NOW)
  const noticed = await markProperlyNoticed(handle.db, world.staff, hearingId, signal, HELD_NOW)
  if (!noticed.ok) throw new Error(`not noticed: ${JSON.stringify(noticed.error)}`)
  const held = await markHearingHeld(
    handle.db,
    world.staff,
    { hearingId, heldOn: d(HEARING_MEETING) },
    signal,
    HELD_NOW,
  )
  if (!held.ok) throw new Error(`not held: ${held.error}`)
  return id
}

describe('a Maine subdivision whose combined hearing is held before acceptance', () => {
  it('supersedes the 60-day clock and runs the 30-day clock from the held date on acceptance', async () => {
    const id = await heldCombinedHearing()
    const accepted = await recordCompletenessVote(
      handle.db,
      world.staff,
      {
        applicationId: id,
        meetingId: await pbMeetingOn(handle.db, HEARING_MEETING),
        votedOn: VOTED_ON,
        outcome: 'accepted',
      },
      signal,
      new Date(`${VOTED_ON}T16:00:00Z`),
    )
    expect(accepted).toEqual({ ok: true, value: undefined })
    expect(await clocksOf(handle.db, id, 'me.pb.decision_no_hearing')).toMatchObject([
      { status: 'superseded', supersededReason: 'cancelled_by_event', startDate: VOTED_ON },
    ])
    expect(await clocksOf(handle.db, id, 'me.pb.decision_after_hearing')).toMatchObject([
      {
        status: 'running',
        startEvent: 'hearing_held',
        startDate: HEARING_MEETING,
        currentDue: '2027-05-14',
      },
    ])
    expect(await clocksOf(handle.db, id, 'me.pb.hearing_window')).toMatchObject([
      { status: 'met', metOn: HEARING_MEETING },
    ])
  })
})
