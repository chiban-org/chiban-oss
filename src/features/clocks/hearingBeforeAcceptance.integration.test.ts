import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { recordCompletenessVote } from '@/features/boards/acceptance'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { setActivePackForTest } from '@/features/packs/registry'
import {
  type BoardWorld,
  boardIdSql,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import { XX_HEARING_BY_KEY, XX_TRIGGER_CLOCKS } from '@/test/packs/xx/triggerVariants'
import { XX_PB_SUBDIVISION_KEY } from '@/test/packs/xx/variants'
import { clockRows } from '@/test/triggerClockFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const MEETING = '2027-04-14'
const HELD_NOW = new Date(`${MEETING}T16:00:00Z`)
const VOTED_ON = d('2027-04-20')
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(XX_TRIGGER_CLOCKS)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    pack: XX_TRIGGER_CLOCKS,
    classificationKey: XX_PB_SUBDIVISION_KEY,
  })
})
afterEach(async () => {
  await handle.drop()
})

async function meetingId(): Promise<string> {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq }) =>
      and(eq(m.meetingDate, MEETING), eq(m.boardId, boardIdSql('planning_board'))),
  })
  return rows[0]?.id ?? ''
}

async function scheduleAndHold(applicationId: string): Promise<void> {
  await issueListWithRecipients(handle.db, world, applicationId, [recipient(1), recipient(2)])
  const scheduled = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId, meetingId: await meetingId(), kind: 'submission_and_hearing' },
    signal,
  )
  if (!scheduled.ok) throw new Error(`not scheduled: ${JSON.stringify(scheduled.error)}`)
  const { hearingId } = scheduled.value
  const [hearing] = await handle.db.query.hearings.findMany({
    where: (h, { eq }) => eq(h.id, hearingId),
  })
  await proveEverything(
    handle.db,
    world,
    applicationId,
    hearing?.noticeSetId ?? '',
    d('2027-03-30'),
    HELD_NOW,
  )
  const noticed = await markProperlyNoticed(handle.db, world.staff, hearingId, signal, HELD_NOW)
  if (!noticed.ok) throw new Error(`not noticed: ${JSON.stringify(noticed.error)}`)
  const held = await markHearingHeld(
    handle.db,
    world.staff,
    { hearingId, heldOn: d(MEETING) },
    signal,
    HELD_NOW,
  )
  if (!held.ok) throw new Error(`not held: ${held.error}`)
}

describe('a planning board hearing held before the board accepts the application', () => {
  it('meets the hearing clock on the held date when the completeness vote accepts', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.zbaTypeKey,
      '2027-03-24',
    )
    await scheduleAndHold(applicationId)
    const accepted = await recordCompletenessVote(
      handle.db,
      world.staff,
      { applicationId, meetingId: await meetingId(), votedOn: VOTED_ON, outcome: 'accepted' },
      signal,
      new Date(`${VOTED_ON}T16:00:00Z`),
    )
    expect(accepted).toEqual({ ok: true, value: undefined })
    const rows = (await clockRows(handle.db, applicationId)).filter(
      (c) => c.ruleKey === XX_HEARING_BY_KEY,
    )
    expect(rows).toMatchObject([
      { status: 'met', metOn: MEETING, startEvent: 'application_accepted', startDate: VOTED_ON },
    ])
  })
})
