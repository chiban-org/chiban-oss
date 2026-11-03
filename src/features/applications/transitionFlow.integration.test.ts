import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, auditLog, clocks, feeAssessments } from '@/db/schema'
import type { CoreState } from '@/features/applications/states'
import { setSubstep, transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { recordRegionalImpactDetermination } from '@/features/building/regionalImpact'
import { startClocksFor } from '@/features/clocks/startClocks'
import { applyCondition } from '@/features/conditions/applicationConditions'
import { assignReviewer, signOffReview } from '@/features/reviews/assignments'
import {
  type ApplicationPatch,
  makeApplication,
  type PermitWorld,
  setupPermitWorld,
} from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { signedOffReview } from '@/test/reviewFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const ON = '2027-03-10' as CivilDate
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
})
afterEach(async () => {
  await handle.drop()
})

async function go(
  actor: Parameters<typeof transitionApplication>[1],
  applicationId: string,
  to: CoreState,
  expectedRowVersion?: number,
) {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      actor,
      {
        applicationId,
        to,
        expectedRowVersion: expectedRowVersion ?? row?.rowVersion ?? 0,
        onDate: ON,
      },
      signal,
    ),
  )
}

async function stateOf(applicationId: string) {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row
}

async function trade(patch: ApplicationPatch = {}) {
  return await makeApplication(
    handle.db,
    world,
    { values: { description: 'Panel upgrade', contractor_license_number: 'EL-1' }, ...patch },
    undefined,
    'EL',
  )
}

describe('building permit review flow', () => {
  async function building(state: CoreState) {
    return await makeApplication(handle.db, world, {
      state,
      values: { finished_sq_ft: '1000' },
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
  }

  async function reviewedBuilding() {
    const app = await building('under_review')
    await signedOffReview(handle.db, world, app.applicationId, signal)
    return app
  }

  it('decided waits for every assigned reviewer to sign off', async () => {
    const app = await building('under_review')
    const assigned = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    if (!assigned.ok) throw new Error(assigned.error)
    const blocked = await go(world.staff, app.applicationId, 'decided')
    const results =
      !blocked.ok && typeof blocked.error === 'object' ? blocked.error.gateBlocked : []
    expect(results.find((g) => g.key === 'reviews.signed_off')).toMatchObject({
      kind: 'administrative',
      effective: 'blocked',
      outcome: { status: 'blocked', reason: '1 assigned review is not signed off.' },
    })
    await signOffReview(
      handle.db,
      world.reviewer,
      { assignmentId: assigned.value.assignmentId },
      signal,
    )
    expect(await go(world.staff, app.applicationId, 'decided')).toMatchObject({ ok: true })
  })

  it('decided assesses at_approval fees once', async () => {
    const app = await reviewedBuilding()
    expect(await go(world.staff, app.applicationId, 'decided')).toMatchObject({ ok: true })
    expect(await go(world.staff, app.applicationId, 'decided', 1)).toEqual({
      ok: false,
      error: 'stale_version',
    })
    const rows = await handle.db
      .select()
      .from(feeAssessments)
      .where(eq(feeAssessments.applicationId, app.applicationId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ stage: 'at_approval', totalCents: 35000 })
  })

  it('an incomplete fee assessment refuses the transition and changes nothing', async () => {
    await saveAndPublish(handle.db, world.admin, 'fee_schedule', 'bp-fees', {
      key: 'bp-fees',
      lines: [
        {
          code: 'notice',
          label: 'Abutter notice',
          due: 'at_approval',
          expr: {
            op: 'per_unit',
            source: { kind: 'count_of', what: 'abutters_on_issued_list' },
            centsPerUnit: 800,
          },
        },
      ],
    })
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    await signedOffReview(handle.db, world, app.applicationId, signal)
    await handle.db.transaction((tx) =>
      startClocksFor(
        tx,
        app.applicationId,
        'application_completed',
        '2027-03-01' as CivilDate,
        signal,
      ),
    )
    expect(await go(world.staff, app.applicationId, 'decided')).toEqual({
      ok: false,
      error: 'fees_incomplete',
    })
    expect((await stateOf(app.applicationId))?.state).toBe('under_review')
    const [clock] = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(clock?.status).toBe('running')
    expect(
      await handle.db
        .select()
        .from(feeAssessments)
        .where(eq(feeAssessments.applicationId, app.applicationId)),
    ).toEqual([])
  })

  it('decided and denied mark the decision clock met', async () => {
    const decided = await reviewedBuilding()
    const denied = await building('under_review')
    for (const a of [decided, denied]) {
      await handle.db.transaction((tx) =>
        startClocksFor(
          tx,
          a.applicationId,
          'application_completed',
          '2027-03-01' as CivilDate,
          signal,
        ),
      )
    }
    await go(world.staff, decided.applicationId, 'decided')
    await go(world.staff, denied.applicationId, 'denied')
    for (const a of [decided, denied]) {
      const [clock] = await handle.db
        .select()
        .from(clocks)
        .where(eq(clocks.applicationId, a.applicationId))
      expect(clock).toMatchObject({ status: 'met', metOn: ON })
    }
  })

  it('generic transition cannot submit a draft, so intake validation and attestation cannot be skipped', async () => {
    const app = await trade({ state: 'draft' })
    for (const actor of [world.applicant, world.staff]) {
      expect(await go(actor, app.applicationId, 'submitted')).toEqual({
        ok: false,
        error: 'invalid_transition',
      })
    }
    expect((await stateOf(app.applicationId))?.state).toBe('draft')
  })

  it('generic transition cannot reinstate a suspended permit, only the appeal path can', async () => {
    const app = await trade({ state: 'suspended', issuedOn: '2027-03-01' })
    expect(await go(world.staff, app.applicationId, 'issued')).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await stateOf(app.applicationId))?.state).toBe('suspended')
  })

  it('under_review needs staff, and an applicant cannot move their own application there', async () => {
    const app = await building('submitted')
    expect(await go(world.applicant, app.applicationId, 'under_review')).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await go(world.staff, app.applicationId, 'under_review')).toMatchObject({ ok: true })
  })
})

describe('substeps', () => {
  async function withSubsteps() {
    const workflow = {
      allowsDirectIssue: false,
      closesOn: 'certificate_of_occupancy' as const,
      substeps: [
        { state: 'under_review' as const, key: 'plan_review', label: 'Plan review' },
        { state: 'under_review' as const, key: 'zoning_review', label: 'Zoning review' },
      ],
    }
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'BP',
      appTypeBody({ workflow }),
    )
    return await makeApplication(handle.db, world, { state: 'under_review' })
  }

  async function sub(actor: Actor, applicationId: string, substep: string, expectedRowVersion = 1) {
    return await handle.db.transaction((tx) =>
      setSubstep(tx, actor, { applicationId, substep, expectedRowVersion }, signal),
    )
  }

  it('substep declared for the state is accepted and bumps the row version', async () => {
    const app = await withSubsteps()
    expect(await sub(world.staff, app.applicationId, 'plan_review')).toMatchObject({
      ok: true,
      value: { substep: 'plan_review', rowVersion: 2 },
    })
  })

  it('substep not declared for the state is refused', async () => {
    const app = await withSubsteps()
    expect(await sub(world.staff, app.applicationId, 'inspections')).toEqual({
      ok: false,
      error: 'invalid_substep',
    })
  })

  it('substep with a stale version or without staff access is refused', async () => {
    const app = await withSubsteps()
    expect(await sub(world.staff, app.applicationId, 'plan_review', 9)).toEqual({
      ok: false,
      error: 'stale_version',
    })
    expect(await sub(world.applicant, app.applicationId, 'plan_review')).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('direct issuance of a building permit', () => {
  it('marks the decision clock met because issuing resolves the application', async () => {
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      'BP',
      appTypeBody({
        workflow: { allowsDirectIssue: true, substeps: [], closesOn: 'certificate_of_occupancy' },
      }),
    )
    const app = await makeApplication(handle.db, world, {
      state: 'submitted',
      receivedDate: '2027-03-01',
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    await handle.db.transaction((tx) =>
      startClocksFor(
        tx,
        app.applicationId,
        'application_completed',
        '2027-03-01' as CivilDate,
        signal,
      ),
    )
    await recordCodeEdition(handle.db, world.staff, { applicationId: app.applicationId }, signal)
    await recordRegionalImpactDetermination(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, determination: 'no', determinedOn: ON },
      signal,
    )
    expect(await go(world.staff, app.applicationId, 'issued')).toMatchObject({ ok: true })
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows.find((c) => c.ruleKey === 'nh.bp.decision')).toMatchObject({
      status: 'met',
      metOn: ON,
    })
  })
})
