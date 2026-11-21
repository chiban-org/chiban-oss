import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { appealNodes, appeals, applications, clocks, holdPermitActions } from '@/db/schema'
import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import { addAppealNode } from '@/features/appeals/graph'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import { startClocksFor } from '@/features/clocks/startClocks'
import {
  releaseDevelopmentHold,
  revokePermitUnderHold,
  suspendPermitUnderHold,
} from '@/features/enforcement/developmentHolds'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { setActivePackForTest } from '@/features/packs/registry'
import type { StatePack } from '@/features/packs/schema'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody } from '@/test/configFixtures'
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
const ISSUED = d('2027-03-05')
const FIRST_DUE = '2027-05-04'
const HOLD_APPEAL_PACK: StatePack = {
  ...HOLD_CLOCK_PACK,
  appealRoutes: [
    {
      from: 'administrative_decision',
      to: 'zba_appeal',
      windowRuleKey: null,
      citation: { label: 'Vellmora Permit Act 9', url: 'https://laws.example/vellmora/permit-act' },
    },
  ],
}
let handle: TestDb
let world: HoldWorld
let hold: HoldHelpers

beforeEach(async () => {
  handle = await makeTestDb()
  const permit = await setupPermitWorld(handle.db)
  setActivePackForTest(HOLD_APPEAL_PACK)
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

function revoke(holdId: string, applicationId: string, actedOn: CivilDate) {
  return revokePermitUnderHold(
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

function uphold(applicationId: string, resolvedOn: CivilDate) {
  return resolveAppeal(
    handle.db,
    world.permit.staff,
    { applicationId, resolvedOn, outcome: 'permit_upheld' },
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

describe('a hold on a permit already suspended by an appeal', () => {
  it('records its suspension without a second move, and the clock tolls once', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    expect(await appeal(permitId, d('2027-03-14'))).toEqual(DONE)
    expect(await suspend(holdId, permitId, d('2027-03-15'))).toEqual(DONE)
    const actions = await handle.db.select().from(holdPermitActions)
    expect(actions.map((a) => [a.action, a.actedOn])).toEqual([['suspended', '2027-03-15']])
    expect(await uphold(permitId, d('2027-03-20'))).toEqual(DONE)
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

describe('an appeal of issuance on a permit suspended by a hold', () => {
  it('is recorded from the appeal graph and keeps the permit suspended after release', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    const [decision] = await handle.db
      .insert(appealNodes)
      .values({
        kind: 'administrative_decision',
        applicationId: permitId,
        occurredOn: '2027-03-06',
        createdBy: world.permit.staff.userId,
      })
      .returning({ id: appealNodes.id })
    expect(await suspend(holdId, permitId, d('2027-03-13'))).toEqual(DONE)
    const added = await addAppealNode(
      handle.db,
      world.permit.admin,
      {
        parentId: decision?.id ?? '',
        kind: 'zba_appeal',
        occurredOn: d('2027-03-14'),
        appellantName: 'Pat Abutter',
      },
      signal,
      HOLD_LATER,
    )
    expect(added.ok).toBe(true)
    const filed = await handle.db.select().from(appeals).where(eq(appeals.applicationId, permitId))
    expect(filed.map((a) => [a.filedOn, a.resolvedOn])).toEqual([['2027-03-14', null]])
    await correct(findingId)
    expect(await release(holdId, d('2027-03-30'))).toEqual(DONE)
    expect(await permitState(permitId)).toEqual({
      state: 'suspended',
      clock: 'stopped',
      due: FIRST_DUE,
    })
    expect(await uphold(permitId, d('2027-03-31'))).toEqual(DONE)
    expect(await permitState(permitId)).toEqual({
      state: 'issued',
      clock: 'running',
      due: '2027-05-22',
    })
  })

  it('is refused when dated inside a hold span that already ended', async () => {
    const permitId = await clockedPermit()
    const { holdId, findingId } = await hold.heldCase()
    expect(await suspend(holdId, permitId, d('2027-03-13'))).toEqual(DONE)
    await correct(findingId)
    expect(await release(holdId, d('2027-03-20'))).toEqual(DONE)
    expect(await permitState(permitId)).toEqual({
      state: 'issued',
      clock: 'running',
      due: '2027-05-11',
    })
    expect(await appeal(permitId, d('2027-03-15'))).toEqual({
      ok: false,
      error: 'filed_during_hold',
    })
    expect(await appeal(permitId, d('2027-03-20'))).toEqual(DONE)
  })
})

describe('closing a permit suspended by a hold', () => {
  it('is refused outside the hold revocation', async () => {
    const permitId = await clockedPermit()
    const { holdId } = await hold.heldCase()
    expect(await suspend(holdId, permitId, d('2027-03-13'))).toEqual(DONE)
    const [row] = await handle.db
      .select({ rowVersion: applications.rowVersion })
      .from(applications)
      .where(eq(applications.id, permitId))
    const closed = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.permit.staff,
        { applicationId: permitId, to: 'closed', expectedRowVersion: row?.rowVersion ?? 0 },
        signal,
        HOLD_LATER,
      ),
    )
    expect(closed).toEqual({ ok: false, error: 'held_suspension' })
    expect((await permitState(permitId)).state).toBe('suspended')
  })

  it('refuses a revocation dated before the suspension it replaces', async () => {
    const permitId = await clockedPermit()
    const { holdId } = await hold.heldCase()
    expect(await suspend(holdId, permitId, d('2027-03-14'))).toEqual(DONE)
    expect(await revoke(holdId, permitId, d('2027-03-13'))).toEqual({
      ok: false,
      error: 'before_suspension',
    })
    expect(await revoke(holdId, permitId, d('2027-03-14'))).toEqual(DONE)
    expect((await permitState(permitId)).state).toBe('closed')
  })
})

describe('submitting a draft while a hold is placed', () => {
  it('refuses inside the transaction when the hold lands after the first check', async () => {
    const draft = await makeApplication(handle.db, world.permit, {}, CURE_NOW, HOLD_TYPE)
    const noticed = await hold.noticedCase()
    const racing = new Proxy(handle.db, {
      get(target, key, receiver) {
        if (key !== 'transaction') return Reflect.get(target, key, receiver) as unknown
        return async (...args: Parameters<Db['transaction']>) => {
          const placed = await hold.place(noticed.caseId)
          if (!placed.ok) throw new Error(placed.error)
          return await target.transaction(...args)
        }
      },
    })
    const submitted = await submitApplication(
      racing,
      world.permit.applicant,
      {
        applicationId: draft.applicationId,
        values: { classification: 'residential' },
        attestation: { statementSha256: attestationHash(appTypeBody().attestationText) },
      },
      signal,
      HOLD_NOW,
    )
    expect(submitted).toEqual({ ok: false, error: 'parcel_held' })
    const [row] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, draft.applicationId))
    expect(row?.state).toBe('draft')
  })
})
