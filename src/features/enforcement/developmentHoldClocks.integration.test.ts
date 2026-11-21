import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appeals, clocks } from '@/db/schema'
import { resolveAppeal } from '@/features/appeals/appeals'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { planWork } from '@/features/applications/workPlan'
import { startClocksFor } from '@/features/clocks/startClocks'
import {
  releaseDevelopmentHold,
  suspendPermitUnderHold,
} from '@/features/enforcement/developmentHolds'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { HELD_ISSUE_COPY } from '@/features/enforcement/holdCopy'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { CURE_NOW } from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  HOLD_CLOCK_PACK,
  HOLD_EXERCISE_KEY,
  HOLD_LATER,
  HOLD_NOW,
  HOLD_TYPE,
  type HoldHelpers,
  type HoldWorld,
  holdHelpers,
  setupHoldWorld,
} from '@/test/holdFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const EXERCISE_KEY = HOLD_EXERCISE_KEY
const ISSUED = d('2027-03-05')
const FIRST_DUE = '2027-05-04'

let handle: TestDb
let world: HoldWorld
let hold: HoldHelpers

beforeEach(async () => {
  handle = await makeTestDb()
  const permit = await setupPermitWorld(handle.db)
  setActivePackForTest(HOLD_CLOCK_PACK)
  world = await setupHoldWorld(handle.db, permit, [
    'xx.bp.decision',
    EXERCISE_KEY,
    'xx.appeal.suspension',
  ])
  hold = holdHelpers(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function clockedPermit(): Promise<string> {
  const permitId = await hold.issuedPermit()
  await handle.db.transaction((tx) => startClocksFor(tx, permitId, 'permit_issued', ISSUED, signal))
  return permitId
}

async function exerciseClock(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  const clock = rows.find((c) => c.ruleKey === EXERCISE_KEY)
  return { status: clock?.status, currentDue: clock?.currentDue }
}

function suspend(holdId: string, applicationId: string, actedOn = d('2027-03-13')) {
  return suspendPermitUnderHold(
    handle.db,
    world.permit.staff,
    { holdId, applicationId, actedOn },
    signal,
  )
}

function release(holdId: string, releasedOn = d('2027-03-30')) {
  return releaseDevelopmentHold(handle.db, world.permit.staff, { holdId, releasedOn }, signal)
}

async function correct(findingId: string) {
  const fixed = await markFindingCorrected(
    handle.db,
    world.permit.staff,
    { findingId, correctedOn: '2027-03-25', note: 'The shoreland strip was replanted.' },
    signal,
  )
  if (!fixed.ok) throw new Error(fixed.error)
}

async function appealThenResolve(applicationId: string, resolvedOn: CivilDate) {
  return await resolveAppeal(
    handle.db,
    world.permit.staff,
    { applicationId, resolvedOn, outcome: 'permit_upheld' },
    signal,
    HOLD_LATER,
  )
}

function openAppeal(applicationId: string) {
  return handle.db.insert(appeals).values({
    applicationId,
    kind: 'appeal_of_issuance',
    filedOn: '2027-03-14',
    appellantName: 'Pat Abutter',
    recordedBy: world.permit.staff.userId,
  })
}

describe('the exercise-by clock under a development hold', () => {
  it('stops on suspension and is tolled for the held days on release', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    await suspend(holdId, permitId)
    expect(await exerciseClock(permitId)).toEqual({ status: 'stopped', currentDue: FIRST_DUE })
    await correct(findingId)
    expect(await release(holdId)).toEqual({ ok: true, value: undefined })
    expect(await exerciseClock(permitId)).toEqual({ status: 'running', currentDue: '2027-05-21' })
  })

  it('stays stopped until the hold ends when the appeal ends first, then tolls once', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    await suspend(holdId, permitId)
    await openAppeal(permitId)
    expect(await appealThenResolve(permitId, d('2027-03-20'))).toEqual({
      ok: true,
      value: undefined,
    })
    expect(await exerciseClock(permitId)).toEqual({ status: 'stopped', currentDue: FIRST_DUE })
    await correct(findingId)
    await release(holdId)
    expect(await exerciseClock(permitId)).toEqual({ status: 'running', currentDue: '2027-05-21' })
  })

  it('stays stopped until the appeal ends when the hold ends first, then tolls once', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    await suspend(holdId, permitId)
    await openAppeal(permitId)
    await correct(findingId)
    await release(holdId)
    expect(await exerciseClock(permitId)).toEqual({ status: 'stopped', currentDue: FIRST_DUE })
    await appealThenResolve(permitId, d('2027-03-31'))
    expect(await exerciseClock(permitId)).toEqual({ status: 'running', currentDue: '2027-05-22' })
  })
})

describe('hold dates', () => {
  it('refuse a date before the hold was placed and acting on a released hold', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    expect(await suspend(holdId, permitId, d('2027-03-11'))).toEqual({
      ok: false,
      error: 'before_placed',
    })
    await correct(findingId)
    expect(await release(holdId, d('2027-03-11'))).toEqual({ ok: false, error: 'before_placed' })
    expect(await release(holdId)).toEqual({ ok: true, value: undefined })
    expect(await suspend(holdId, permitId, d('2027-03-31'))).toEqual({
      ok: false,
      error: 'after_released',
    })
  })
})

describe('the staff application page on a held parcel', () => {
  it('does not offer Issue and says why', async () => {
    const app = await makeApplication(
      handle.db,
      world.permit,
      { state: 'decided', decidedOn: '2027-03-04' },
      CURE_NOW,
      HOLD_TYPE,
    )
    await hold.heldCase()
    const view = await getStaffApplicationView(
      handle.db,
      world.permit.staff,
      app.applicationId,
      HOLD_NOW,
      signal,
    )
    if (view === null) throw new Error('view')
    expect(view.allowedMoves).not.toContain('issued')
    const plan = planWork(view, null, {
      reviewers: 0,
      abilities: new Set(),
      responsible: null,
    })
    expect(plan.now?.warnings.map((w) => w.text)).toContain(HELD_ISSUE_COPY)
    expect(plan.now?.action).toBeNull()
  })
})
