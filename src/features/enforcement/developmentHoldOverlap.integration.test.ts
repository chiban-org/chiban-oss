import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks, holdPermitActions } from '@/db/schema'
import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import { startClocksFor } from '@/features/clocks/startClocks'
import {
  releaseDevelopmentHold,
  suspendPermitUnderHold,
} from '@/features/enforcement/developmentHolds'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { setActivePackForTest } from '@/features/packs/registry'
import { setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  HOLD_CLOCK_PACK,
  HOLD_EXERCISE_KEY,
  HOLD_LATER,
  type HoldHelpers,
  type HoldWorld,
  holdHelpers,
  setupHoldWorld,
} from '@/test/holdFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
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
    HOLD_EXERCISE_KEY,
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

async function permitState(applicationId: string) {
  const [app] = await handle.db
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  const clock = rows.find((c) => c.ruleKey === HOLD_EXERCISE_KEY)
  return { state: app?.state, clock: clock?.status, due: clock?.currentDue }
}

function suspend(holdId: string, applicationId: string, actedOn: CivilDate) {
  return suspendPermitUnderHold(
    handle.db,
    world.permit.staff,
    { holdId, applicationId, actedOn },
    signal,
  )
}

function release(holdId: string, releasedOn: CivilDate) {
  return releaseDevelopmentHold(handle.db, world.permit.staff, { holdId, releasedOn }, signal)
}

function appeal(applicationId: string, filedOn: CivilDate) {
  return recordAppeal(
    handle.db,
    world.permit.staff,
    { applicationId, filedOn, appellantName: 'Pat Abutter' },
    signal,
    { now: HOLD_LATER },
  )
}

function resolve(
  applicationId: string,
  resolvedOn: CivilDate,
  outcome: 'permit_upheld' | 'permit_revoked' = 'permit_upheld',
) {
  return resolveAppeal(
    handle.db,
    world.permit.staff,
    { applicationId, resolvedOn, outcome },
    signal,
    HOLD_LATER,
  )
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

const DONE = { ok: true, value: undefined }

describe('resolving an appeal on a permit a hold also suspends', () => {
  it('refuses a date before the hold suspension and tolls the whole span once', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    expect(await appeal(permitId, d('2027-03-14'))).toEqual(DONE)
    expect(await suspend(holdId, permitId, d('2027-03-25'))).toEqual(DONE)
    expect(await resolve(permitId, d('2027-03-20'))).toEqual({ ok: false, error: 'before_hold' })
    expect(await resolve(permitId, d('2027-03-26'))).toEqual(DONE)
    expect(await permitState(permitId)).toEqual({
      state: 'suspended',
      clock: 'stopped',
      due: FIRST_DUE,
    })
    await correct(findingId)
    expect(await release(holdId, d('2027-03-30'))).toEqual(DONE)
    expect(await permitState(permitId)).toEqual({
      state: 'issued',
      clock: 'running',
      due: '2027-05-20',
    })
  })
})
