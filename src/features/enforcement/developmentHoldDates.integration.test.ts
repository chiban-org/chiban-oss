import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks } from '@/db/schema'
import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import { startClocksFor } from '@/features/clocks/startClocks'
import {
  releaseDevelopmentHold,
  suspendPermitUnderHold,
} from '@/features/enforcement/developmentHolds'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { CURE_NOW } from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  HOLD_CLOCK_PACK,
  HOLD_EXERCISE_KEY,
  HOLD_LATER,
  HOLD_TYPE,
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
const PLAIN_TYPE = 'BPY'
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

async function clockedPermit(typeKey = HOLD_TYPE): Promise<string> {
  const made = await makeApplication(
    handle.db,
    world.permit,
    { state: 'issued', issuedOn: ISSUED, decidedOn: '2027-03-04' },
    CURE_NOW,
    typeKey,
  )
  await handle.db.transaction((tx) =>
    startClocksFor(tx, made.applicationId, 'permit_issued', ISSUED, signal),
  )
  return made.applicationId
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

async function correct(findingId: string) {
  const fixed = await markFindingCorrected(
    handle.db,
    world.permit.staff,
    { findingId, correctedOn: '2027-03-25', note: 'The shoreland strip was replanted.' },
    signal,
  )
  if (!fixed.ok) throw new Error(fixed.error)
}

async function appeal(applicationId: string, filedOn: CivilDate) {
  const filed = await recordAppeal(
    handle.db,
    world.permit.staff,
    { applicationId, filedOn, appellantName: 'Pat Abutter' },
    signal,
    { now: HOLD_LATER },
  )
  if (!filed.ok) throw new Error(filed.error)
}

describe('hold dates that would toll a permit backwards or twice', () => {
  it('refuse a release dated before a permit was suspended under the hold', async () => {
    const permitId = await clockedPermit()
    const { holdId } = await hold.heldCase()
    expect(await suspend(holdId, permitId, d('2027-03-25'))).toEqual({ ok: true, value: undefined })
    expect(await release(holdId, d('2027-03-20'))).toEqual({
      ok: false,
      error: 'before_suspension',
    })
    expect(await permitState(permitId)).toEqual({
      state: 'suspended',
      clock: 'stopped',
      due: FIRST_DUE,
    })
  })

  it('refuse a suspension dated before the permit went back into force after an appeal', async () => {
    const permitId = await clockedPermit()
    const { holdId } = await hold.heldCase()
    await appeal(permitId, d('2027-03-13'))
    const upheld = await resolveAppeal(
      handle.db,
      world.permit.staff,
      { applicationId: permitId, resolvedOn: d('2027-03-20'), outcome: 'permit_upheld' },
      signal,
      HOLD_LATER,
    )
    expect(upheld.ok).toBe(true)
    expect(await permitState(permitId)).toEqual({
      state: 'issued',
      clock: 'running',
      due: '2027-05-11',
    })
    expect(await suspend(holdId, permitId, d('2027-03-15'))).toEqual({
      ok: false,
      error: 'before_reinstatement',
    })
    expect(await suspend(holdId, permitId, d('2027-03-20'))).toEqual({ ok: true, value: undefined })
  })
})

describe('an appeal on a type that is not suspended by appeal', () => {
  it('does not keep a held permit suspended, and release tolls only the hold days', async () => {
    await saveAndPublish(
      handle.db,
      world.permit.admin,
      'application_type',
      PLAIN_TYPE,
      appTypeBody({
        key: PLAIN_TYPE,
        prefix: 'BY',
        classification: 'xx.building_permit',
        bindings: ['xx.bp.decision', HOLD_EXERCISE_KEY],
      }),
    )
    const permitId = await clockedPermit(PLAIN_TYPE)
    const { holdId, findingId } = await hold.heldCase()
    await appeal(permitId, d('2027-03-12'))
    expect((await permitState(permitId)).state).toBe('issued')
    expect(await suspend(holdId, permitId, d('2027-03-13'))).toEqual({ ok: true, value: undefined })
    await correct(findingId)
    expect(await release(holdId, d('2027-03-30'))).toEqual({ ok: true, value: undefined })
    expect(await permitState(permitId)).toEqual({
      state: 'issued',
      clock: 'running',
      due: '2027-05-21',
    })
  })
})
