import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationParcels, applications, clocks, enforcementAppeals } from '@/db/schema'
import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { startClocksFor } from '@/features/clocks/startClocks'
import {
  recordCivilAction,
  releaseDevelopmentHold,
  revokePermitUnderHold,
  suspendPermitUnderHold,
} from '@/features/enforcement/developmentHolds'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { permitsOnHeldParcel } from '@/features/enforcement/holdPermits'
import { setActivePackForTest } from '@/features/packs/registry'
import type { PackRule } from '@/features/packs/schema'
import { setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  HOLD_CLOCK_PACK,
  HOLD_COURT,
  HOLD_EXERCISE_KEY,
  HOLD_LAPSED,
  HOLD_LATER,
  type HoldHelpers,
  type HoldWorld,
  holdHelpers,
  setupHoldWorld,
} from '@/test/holdFixtures'
import { xxPackWith } from '@/test/packs/xx/variants'
import { makeParcel } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const ISSUED = d('2027-03-05')
const DONE = { ok: true, value: undefined }
let handle: TestDb
let world: HoldWorld
let hold: HoldHelpers

const STAY_RULE: PackRule = {
  kind: 'effect',
  key: 'xx.appeal.enforcement_stay',
  version: 1,
  label: 'Enforcement stayed by appeal',
  citation: { label: 'Vellmora Permit Act 30', url: 'https://laws.example/vellmora/permit-act' },
  effect: 'stay_enforcement_on_appeal',
  overridePolicy: { policy: 'fixed' },
}

const STAY_RULES = [...HOLD_CLOCK_PACK.manifest.rules, STAY_RULE]
const STAY_PACK = xxPackWith({
  manifest: { rules: STAY_RULES },
  pack: { ruleAreas: [{ title: 'All rules', rules: STAY_RULES }] },
})

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

function suspend(holdId: string, applicationId: string, actedOn: string) {
  return suspendPermitUnderHold(
    handle.db,
    world.permit.staff,
    { holdId, applicationId, actedOn: d(actedOn) },
    signal,
  )
}

function release(holdId: string, releasedOn: string) {
  return releaseDevelopmentHold(
    handle.db,
    world.permit.staff,
    { holdId, releasedOn: d(releasedOn) },
    signal,
  )
}

function appeal(applicationId: string, filedOn: string) {
  return recordAppeal(
    handle.db,
    world.permit.staff,
    { applicationId, filedOn: d(filedOn), appellantName: 'Pat Abutter' },
    signal,
    { now: HOLD_LATER },
  )
}

function resolve(applicationId: string, resolvedOn: string) {
  return resolveAppeal(
    handle.db,
    world.permit.staff,
    { applicationId, resolvedOn: d(resolvedOn), outcome: 'permit_upheld' },
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

async function secondHeldParcel(permitId: string) {
  const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '007003000000' }])
  await handle.db
    .insert(applicationParcels)
    .values({ applicationId: permitId, parcelId, addedBy: world.permit.staff.userId })
  const noticed = await hold.noticedCase(parcelId)
  const placed = await hold.place(noticed.caseId)
  if (!placed.ok) throw new Error(placed.error)
  return { ...noticed, parcelId, holdId: placed.value.holdId }
}

describe('a permit on two held parcels', () => {
  it('records the second hold without a state move and stays suspended until both are released', async () => {
    const permitId = await clockedPermit()
    const first = await hold.heldCase()
    const second = await secondHeldParcel(permitId)
    expect(await suspend(first.holdId, permitId, '2027-03-13')).toEqual(DONE)
    const offered = await permitsOnHeldParcel(
      handle.db,
      { holdId: second.holdId, parcelId: second.parcelId },
      signal,
    )
    expect(offered.find((p) => p.applicationId === permitId)?.suspendable).toBe(true)
    expect(await suspend(second.holdId, permitId, '2027-03-16')).toEqual(DONE)
    await correct(first.findingId)
    expect(await release(first.holdId, '2027-03-20')).toEqual(DONE)
    expect(await permitState(permitId)).toEqual({
      state: 'suspended',
      clock: 'stopped',
      due: '2027-05-04',
    })
    await correct(second.findingId)
    expect(await release(second.holdId, '2027-03-30')).toEqual(DONE)
    expect(await permitState(permitId)).toEqual({
      state: 'issued',
      clock: 'running',
      due: '2027-05-21',
    })
  })

  it('treats the permit as suspended throughout, so later steps may be dated before the first release', async () => {
    const permitId = await clockedPermit()
    const first = await hold.heldCase()
    const second = await secondHeldParcel(permitId)
    expect(await suspend(first.holdId, permitId, '2027-03-13')).toEqual(DONE)
    expect(await suspend(second.holdId, permitId, '2027-03-16')).toEqual(DONE)
    await correct(first.findingId)
    expect(await release(first.holdId, '2027-03-20')).toEqual(DONE)
    expect(
      await revokePermitUnderHold(
        handle.db,
        world.permit.staff,
        { holdId: second.holdId, applicationId: permitId, actedOn: d('2027-03-18') },
        signal,
      ),
    ).toEqual(DONE)
    expect((await permitState(permitId)).state).toBe('closed')
  })
})

describe('an appeal of a permit suspended under a hold', () => {
  it('can be recorded while the hold stands, and the staff view offers its form', async () => {
    const permitId = await clockedPermit()
    const { holdId } = await hold.heldCase()
    expect(await suspend(holdId, permitId, '2027-03-13')).toEqual(DONE)
    const before = await getStaffApplicationView(
      handle.db,
      world.permit.staff,
      permitId,
      HOLD_LATER,
      signal,
    )
    expect(before?.acceptsAppeal).toBe(true)
    expect(await appeal(permitId, '2027-03-15')).toEqual(DONE)
    const after = await getStaffApplicationView(
      handle.db,
      world.permit.staff,
      permitId,
      HOLD_LATER,
      signal,
    )
    expect(after?.acceptsAppeal).toBe(false)
  })

  it('dated inside a past hold is refused after the release, and one dated before the hold says so too', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    expect(await suspend(holdId, permitId, '2027-03-13')).toEqual(DONE)
    await correct(findingId)
    expect(await release(holdId, '2027-03-20')).toEqual(DONE)
    expect(await appeal(permitId, '2027-03-15')).toEqual({
      ok: false,
      error: 'filed_during_hold',
    })
    expect(await appeal(permitId, '2027-03-12')).toEqual({
      ok: false,
      error: 'before_reinstatement',
    })
    expect(await appeal(permitId, '2027-03-20')).toEqual(DONE)
  })
})

describe('releasing a hold after an appeal was resolved while it stood', () => {
  it('refuses a release dated before the resolution and tolls the whole span', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    expect(await suspend(holdId, permitId, '2027-03-13')).toEqual(DONE)
    expect(await appeal(permitId, '2027-03-14')).toEqual(DONE)
    expect(await resolve(permitId, '2027-03-25')).toEqual(DONE)
    await correct(findingId)
    expect(await release(holdId, '2027-03-20')).toEqual({
      ok: false,
      error: 'before_appeal_resolution',
    })
    expect(await release(holdId, '2027-03-25')).toEqual(DONE)
    expect(await permitState(permitId)).toEqual({
      state: 'issued',
      clock: 'running',
      due: '2027-05-16',
    })
  })
})

describe('remedies under an enforcement stay', () => {
  it('refuses a hold and a civil action while an appeal stays enforcement', async () => {
    setActivePackForTest(STAY_PACK)
    const { caseId } = await hold.noticedCase()
    const [stay] = await handle.db
      .insert(enforcementAppeals)
      .values({
        caseId,
        targetKind: 'notice',
        targetId: caseId,
        filedOn: '2027-03-10',
        appellantName: 'Pat Owner',
        recordedBy: world.permit.staff.userId,
      })
      .returning({ id: enforcementAppeals.id })
    expect(await hold.place(caseId, HOLD_LAPSED)).toEqual({ ok: false, error: 'stayed' })
    const civil = { caseId, filedOn: HOLD_LAPSED, court: HOLD_COURT, docket: null }
    expect(await recordCivilAction(handle.db, world.permit.staff, civil, signal)).toEqual({
      ok: false,
      error: 'stayed',
    })
    await handle.db
      .update(enforcementAppeals)
      .set({ resolvedOn: '2027-03-11' })
      .where(eq(enforcementAppeals.id, stay?.id ?? ''))
    expect((await hold.place(caseId, HOLD_LAPSED)).ok).toBe(true)
    expect((await recordCivilAction(handle.db, world.permit.staff, civil, signal)).ok).toBe(true)
  })
})
