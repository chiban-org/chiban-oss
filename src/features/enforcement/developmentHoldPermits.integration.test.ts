import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appeals, applications, developmentHolds, holdPermitActions } from '@/db/schema'
import { resolveAppeal } from '@/features/appeals/appeals'
import { isSuspended } from '@/features/appeals/suspension'
import { recordEnforcementAppeal } from '@/features/enforcement/appeals'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import {
  activeHoldFor,
  releaseDevelopmentHold,
  revokePermitUnderHold,
  suspendPermitUnderHold,
} from '@/features/enforcement/developmentHolds'
import { markFindingCorrected } from '@/features/enforcement/findingChanges'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import { requestInspection } from '@/features/inspections/requestInspection'
import { setActivePackForTest } from '@/features/packs/registry'
import { setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  HOLD_LATER,
  HOLD_NOW,
  type HoldHelpers,
  type HoldWorld,
  holdHelpers,
  setupHoldWorld,
} from '@/test/holdFixtures'
import { makeTestStore } from '@/test/objectStore'
import { XX_CURE } from '@/test/packs/xx/cure'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const ACTED = d('2027-03-13')
const RELEASED = d('2027-03-30')
let handle: TestDb
let world: HoldWorld
let hold: HoldHelpers

beforeEach(async () => {
  handle = await makeTestDb()
  const permit = await setupPermitWorld(handle.db)
  setActivePackForTest(XX_CURE)
  world = await setupHoldWorld(handle.db, permit)
  hold = holdHelpers(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function stateOf(applicationId: string) {
  const [row] = await handle.db
    .select({ state: applications.state, closureReason: applications.closureReason })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row
}

function suspend(holdId: string, applicationId: string) {
  return suspendPermitUnderHold(
    handle.db,
    world.permit.staff,
    { holdId, applicationId, actedOn: ACTED },
    signal,
  )
}

function release(holdId: string) {
  return releaseDevelopmentHold(
    handle.db,
    world.permit.staff,
    { holdId, releasedOn: RELEASED },
    signal,
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

function openAppeal(applicationId: string) {
  return handle.db.insert(appeals).values({
    applicationId,
    kind: 'appeal_of_issuance',
    filedOn: '2027-03-14',
    appellantName: 'Pat Abutter',
    recordedBy: world.permit.staff.userId,
  })
}

describe('permits under a development hold', () => {
  it('suspends an issued permit, stops inspections, and release reinstates it', async () => {
    const permitId = await hold.issuedPermit()
    const { holdId, findingId } = await hold.heldCase()
    expect(await suspend(holdId, permitId)).toEqual({ ok: true, value: undefined })
    expect((await stateOf(permitId))?.state).toBe('suspended')
    expect(await isSuspended(handle.db, permitId, signal)).toBe(true)
    const inspection = await requestInspection(
      handle.db,
      world.permit.staff,
      {
        applicationId: permitId,
        checklistVersionId: '00000000-0000-4000-8000-000000000000',
        channel: 'counter',
        contactName: 'Pat Applicant',
      },
      signal,
      { now: HOLD_NOW },
    )
    expect(inspection).toEqual({ ok: false, error: 'permit_suspended' })
    await correct(findingId)
    expect(await release(holdId)).toEqual({ ok: true, value: undefined })
    expect((await stateOf(permitId))?.state).toBe('issued')
    expect(await isSuspended(handle.db, permitId, signal)).toBe(false)
    const [action] = await handle.db.select().from(holdPermitActions)
    expect(action).toMatchObject({ action: 'suspended', reinstatedOn: RELEASED })
    expect(await activeHoldFor(handle.db, world.permit.parcelId, signal)).toBeNull()
  })

  it('revokes an issued permit and closes it with the reason', async () => {
    const permitId = await hold.issuedPermit()
    const { holdId } = await hold.heldCase()
    const revoked = await revokePermitUnderHold(
      handle.db,
      world.permit.staff,
      { holdId, applicationId: permitId, actedOn: ACTED },
      signal,
    )
    expect(revoked).toEqual({ ok: true, value: undefined })
    expect(await stateOf(permitId)).toEqual({
      state: 'closed',
      closureReason: 'revoked_under_hold',
    })
  })

  it('revokes a permit it suspended, and release leaves it closed', async () => {
    const permitId = await hold.issuedPermit()
    const { holdId, findingId } = await hold.heldCase()
    await suspend(holdId, permitId)
    const revoked = await revokePermitUnderHold(
      handle.db,
      world.permit.staff,
      { holdId, applicationId: permitId, actedOn: d('2027-03-15') },
      signal,
    )
    expect(revoked).toEqual({ ok: true, value: undefined })
    const [action] = await handle.db.select().from(holdPermitActions)
    expect(action).toMatchObject({ action: 'revoked', reinstatedOn: null })
    await correct(findingId)
    expect(await release(holdId)).toEqual({ ok: true, value: undefined })
    expect(await stateOf(permitId)).toEqual({
      state: 'closed',
      closureReason: 'revoked_under_hold',
    })
  })

  it('stays active when an enforcement appeal is recorded', async () => {
    const { caseId, findingId } = await hold.heldCase()
    const designated = await designateEnforcementOfficer(
      handle.db,
      world.permit.admin,
      {
        userId: world.permit.staff.userId,
        title: 'Code Enforcement Officer',
        adoptingAuthority: 'Select Board',
        adoptedOn: '2027-01-05',
      },
      signal,
    )
    expect(designated.ok).toBe(true)
    const drafted = await draftOrder(
      handle.db,
      world.permit.staff,
      {
        caseId,
        findingIds: [findingId],
        correctiveAction: 'Replant the shoreland strip.',
        correctiveDeadline: '2027-05-15',
        ceaseImmediately: false,
      },
      signal,
      HOLD_NOW,
    )
    if (!drafted.ok) throw new Error(JSON.stringify(drafted.error))
    const store = (await makeTestStore()).store
    const issued = await issueOrder(
      handle.db,
      store,
      world.permit.staff,
      { orderId: drafted.value.orderId, issuedOn: '2027-03-12', expectedRowVersion: 1 },
      signal,
      HOLD_NOW,
    )
    if (!issued.ok) throw new Error(JSON.stringify(issued.error))
    const appeal = await recordEnforcementAppeal(
      handle.db,
      world.permit.staff,
      {
        caseId,
        targetKind: 'order',
        targetId: drafted.value.orderId,
        filedOn: d('2027-03-14'),
        appellantName: 'Larkspur Family Trust',
      },
      signal,
      HOLD_LATER,
    )
    expect(appeal.ok).toBe(true)
    expect(await activeHoldFor(handle.db, world.permit.parcelId, signal)).not.toBeNull()
  })
})

describe('releasing a development hold', () => {
  it('needs the violation corrected and every fine paid', async () => {
    const { holdId, caseId, findingId } = await hold.heldCase()
    const store = (await makeTestStore()).store
    const fineId = await hold.unpaidFine(store, caseId, 50000)
    expect(await release(holdId)).toEqual({ ok: false, error: 'findings_open' })
    await correct(findingId)
    expect(await release(holdId)).toEqual({ ok: false, error: 'balance_due' })
    await hold.payFine(fineId, 50000)
    expect(await release(holdId)).toEqual({ ok: true, value: undefined })
    expect(await release(holdId)).toEqual({ ok: false, error: 'already_released' })
    const [row] = await handle.db.select().from(developmentHolds)
    expect(row?.releasedOn).toBe(RELEASED)
  })
})

describe('a permit both under a hold and on appeal', () => {
  it('stays suspended until both the hold and the appeal let it go', async () => {
    const permitId = await hold.issuedPermit()
    const { holdId, findingId } = await hold.heldCase()
    await suspend(holdId, permitId)
    await openAppeal(permitId)
    const upheld = await resolveAppeal(
      handle.db,
      world.permit.staff,
      { applicationId: permitId, resolvedOn: d('2027-03-20'), outcome: 'permit_upheld' },
      signal,
      HOLD_LATER,
    )
    expect(upheld).toEqual({ ok: true, value: undefined })
    expect((await stateOf(permitId))?.state).toBe('suspended')
    await openAppeal(permitId)
    await correct(findingId)
    expect(await release(holdId)).toEqual({ ok: true, value: undefined })
    expect((await stateOf(permitId))?.state).toBe('suspended')
    const second = await resolveAppeal(
      handle.db,
      world.permit.staff,
      { applicationId: permitId, resolvedOn: d('2027-03-31'), outcome: 'permit_upheld' },
      signal,
      HOLD_LATER,
    )
    expect(second).toEqual({ ok: true, value: undefined })
    expect((await stateOf(permitId))?.state).toBe('issued')
  })
})
