import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { recordDecision } from '@/features/decisions/recordDecision'
import { setActivePackForTest } from '@/features/packs/registry'
import { expireLapsedPermits } from '@/jobs/clocksDaily'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES } from '@/test/hearingFixtures'
import { type InspectionWorld, setupInspectionWorld } from '@/test/inspectionFixtures'
import {
  XX_COMMENCEMENT_KEY,
  XX_HEARING_BY_KEY,
  XX_TRIGGER_CLOCKS,
} from '@/test/packs/xx/triggerVariants'
import {
  acceptedBoardApplication,
  clockRows,
  holdTriggerHearing,
  issuedCommencementPermit,
  publishCommencementType,
  recordRoughInspection,
  scheduleTriggerHearing,
  TRIGGER_MEETING,
  triggerMeetingId,
} from '@/test/triggerClockFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const ISSUED = d('2027-06-20')
const PAST_LAPSE = d('2029-07-01')
const ACCEPTED = d('2027-03-02')

async function appState(db: TestDb['db'], applicationId: string) {
  const [row] = await db
    .select({ state: applications.state, completedDate: applications.completedDate })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row
}

describe('a lapse clock met by the first inspection', () => {
  let handle: TestDb
  let w: InspectionWorld

  beforeAll(async () => {
    handle = await makeTestDb()
    w = await setupInspectionWorld(handle.db)
    setActivePackForTest(XX_TRIGGER_CLOCKS)
    await publishCommencementType(handle.db, w)
  })
  afterAll(async () => {
    setActivePackForTest(null)
    await handle.drop()
  })

  async function commencement(applicationId: string) {
    return (await clockRows(handle.db, applicationId)).find(
      (c) => c.ruleKey === XX_COMMENCEMENT_KEY,
    )
  }

  async function expire() {
    return await handle.db.transaction((tx) => expireLapsedPermits(tx, PAST_LAPSE, signal))
  }

  it('is met by the first inspection result and never expires the permit afterwards', async () => {
    const applicationId = await issuedCommencementPermit(handle.db, w, ISSUED)
    expect(await commencement(applicationId)).toMatchObject({
      status: 'running',
      currentDue: '2029-06-20',
    })
    await recordRoughInspection(handle.db, w, applicationId)
    expect(await commencement(applicationId)).toMatchObject({
      status: 'met',
      metOn: '2027-07-07',
    })
    expect(await expire()).toEqual([])
    expect((await appState(handle.db, applicationId))?.state).toBe('issued')
    expect((await commencement(applicationId))?.status).toBe('met')
  })

  it('expires the permit when no inspection was recorded', async () => {
    const applicationId = await issuedCommencementPermit(handle.db, w, ISSUED)
    expect(await expire()).toEqual([])
    expect((await appState(handle.db, applicationId))?.state).toBe('expired')
    expect((await commencement(applicationId))?.status).toBe('lapsed')
  })
})

describe('a clock that starts only when a hearing is scheduled', () => {
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
      zbaMeetings: [TRIGGER_MEETING],
      pack: XX_TRIGGER_CLOCKS,
      classificationKey: 'xx.board_variance',
    })
  })
  afterEach(async () => {
    await handle.drop()
  })

  async function hearingBy(applicationId: string) {
    return (await clockRows(handle.db, applicationId)).filter(
      (c) => c.ruleKey === XX_HEARING_BY_KEY,
    )
  }

  it('does not exist after acceptance', async () => {
    const applicationId = await acceptedBoardApplication(handle.db, world, ACCEPTED)
    expect(await hearingBy(applicationId)).toEqual([])
  })

  it('appears when a hearing is scheduled later, due 30 days after acceptance', async () => {
    const applicationId = await acceptedBoardApplication(handle.db, world, ACCEPTED)
    await scheduleTriggerHearing(handle.db, world, applicationId)
    expect(await hearingBy(applicationId)).toMatchObject([
      {
        status: 'running',
        startEvent: 'application_accepted',
        startDate: ACCEPTED,
        currentDue: '2027-04-01',
      },
    ])
  })

  it('is met when the hearing is held', async () => {
    const applicationId = await acceptedBoardApplication(handle.db, world, ACCEPTED)
    const hearingId = await scheduleTriggerHearing(handle.db, world, applicationId)
    await holdTriggerHearing(handle.db, world, applicationId, hearingId)
    expect(await hearingBy(applicationId)).toMatchObject([
      { status: 'met', metOn: TRIGGER_MEETING },
    ])
  })

  it('never appears for an application decided without a hearing', async () => {
    const applicationId = await acceptedBoardApplication(handle.db, world, ACCEPTED)
    const decided = await recordDecision(
      handle.db,
      world.staff,
      {
        applicationId,
        hearingId: null,
        meetingId: await triggerMeetingId(handle.db),
        votedOn: d(TRIGGER_MEETING),
        outcome: 'approved',
        motion: 'Move to approve as presented.',
        votes: FIXTURE_VOTES,
        findings: 'The proposal meets each criterion.',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(decided.ok).toBe(true)
    expect(await hearingBy(applicationId)).toEqual([])
  })

  it('waits for a recorded acceptance and starts when acceptance follows the scheduling', async () => {
    const applicationId = await acceptedBoardApplication(handle.db, world, null)
    await scheduleTriggerHearing(handle.db, world, applicationId)
    expect(await hearingBy(applicationId)).toEqual([])
    await handle.db.transaction((tx) =>
      startClocksFor(tx, applicationId, 'application_accepted', ACCEPTED, signal),
    )
    expect(await hearingBy(applicationId)).toMatchObject([
      { status: 'running', startDate: ACCEPTED, currentDue: '2027-04-01' },
    ])
  })

  it('dates the clock from an acceptance recorded while scheduling the hearing', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.zbaTypeKey,
      '2027-03-02',
    )
    await scheduleTriggerHearing(handle.db, world, applicationId)
    const accepted = (await appState(handle.db, applicationId))?.completedDate
    expect(accepted).not.toBeNull()
    expect(await hearingBy(applicationId)).toMatchObject([
      { status: 'running', startEvent: 'application_accepted', startDate: accepted },
    ])
  })
})
