import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
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
const MEETING = d('2027-04-14')
const HELD_NOW = new Date(`${MEETING}T16:00:00Z`)
const BLOCKED_MS = 400
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

async function noticedHearing(applicationId: string): Promise<string> {
  const meetings = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: same }) =>
      and(same(m.meetingDate, MEETING), same(m.boardId, boardIdSql('planning_board'))),
  })
  await issueListWithRecipients(handle.db, world, applicationId, [recipient(1), recipient(2)])
  const scheduled = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId, meetingId: meetings[0]?.id ?? '', kind: 'submission_and_hearing' },
    signal,
  )
  if (!scheduled.ok) throw new Error(`not scheduled: ${JSON.stringify(scheduled.error)}`)
  const { hearingId } = scheduled.value
  const [hearing] = await handle.db.query.hearings.findMany({
    where: (h, { eq: same }) => same(h.id, hearingId),
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
  return hearingId
}

function acceptanceInFlight(applicationId: string) {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started: () => void = () => undefined
  const clockStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const done = handle.db.transaction(async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for('update')
    await tx
      .update(applications)
      .set({ completedDate: MEETING })
      .where(eq(applications.id, applicationId))
    await startClocksFor(tx, applicationId, 'application_accepted', MEETING, signal)
    started()
    await gate
  })
  return { clockStarted, release, done }
}

describe('a hearing held while the board is accepting the application', () => {
  it('meets the hearing clock the acceptance is still starting', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.zbaTypeKey,
      '2027-03-24',
    )
    const hearingId = await noticedHearing(applicationId)
    const acceptance = acceptanceInFlight(applicationId)
    await acceptance.clockStarted
    const holding = markHearingHeld(
      handle.db,
      world.staff,
      { hearingId, heldOn: MEETING },
      signal,
      HELD_NOW,
    )
    await new Promise((resolve) => setTimeout(resolve, BLOCKED_MS))
    acceptance.release()
    await acceptance.done
    expect(await holding).toEqual({ ok: true, value: undefined })
    const rows = (await clockRows(handle.db, applicationId)).filter(
      (c) => c.ruleKey === XX_HEARING_BY_KEY,
    )
    expect(rows).toMatchObject([{ status: 'met', metOn: MEETING, startDate: MEETING }])
  })
})
