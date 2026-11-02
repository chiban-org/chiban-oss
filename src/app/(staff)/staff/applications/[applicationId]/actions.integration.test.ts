import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { applications, clocks, feeOverrides, gateOverrides } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const actions = await import('@/app/(staff)/staff/applications/[applicationId]/actions')

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
})

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const ALL = {
  transitionAction: actions.transitionAction,
  setSubstepAction: actions.setSubstepAction,
  markCompleteAction: actions.markCompleteAction,
  recordCodeEditionAction: actions.recordCodeEditionAction,
  overrideGateAction: actions.overrideGateAction,
  statutoryExceptionAction: actions.statutoryExceptionAction,
  revokeOverrideAction: actions.revokeOverrideAction,
  adjustClockAction: actions.adjustClockAction,
  feeOverrideAction: actions.feeOverrideAction,
  regionalImpactAction: actions.regionalImpactAction,
  regionalNoticeAction: actions.regionalNoticeAction,
  recordAppealAction: actions.recordAppealAction,
  resolveAppealAction: actions.resolveAppealAction,
  renewAction: actions.renewAction,
  applyConditionAction: actions.applyConditionAction,
  setConditionStatusAction: actions.setConditionStatusAction,
}

async function trade(patch: Parameters<typeof makeApplication>[2] = {}) {
  return await makeApplication(
    handle.db,
    world,
    { values: { description: 'Panel', contractor_license_number: 'EL-1' }, ...patch },
    undefined,
    'EL',
  )
}

describe('application actions', () => {
  it.each(Object.entries(ALL))('%s rejects a missing csrf token', async (_n, action) => {
    state.actor = world.admin
    expect(await action(form({}, null))).toMatchObject({
      ok: false,
      error: expect.stringContaining('session expired'),
    })
  })

  it.each(Object.entries(ALL))('%s rejects a signed-out caller', async (_n, action) => {
    state.actor = null
    expect(await action(form({}))).toMatchObject({ ok: false, error: 'Sign in to continue.' })
  })

  it('issue without permit.issue is forbidden via server action', async () => {
    const app = await trade({ state: 'submitted' })
    for (const actor of [world.reviewer, await staffActor(handle.db, 'inspector')]) {
      state.actor = actor
      const result = await actions.transitionAction(
        form({ applicationId: app.applicationId, to: 'issued', expectedRowVersion: '1' }),
      )
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
    }
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row?.state).toBe('submitted')
  })

  it('staff with permit.issue issues a trade permit', async () => {
    const app = await trade({ state: 'submitted' })
    state.actor = world.staff
    const result = await actions.transitionAction(
      form({ applicationId: app.applicationId, to: 'issued', expectedRowVersion: '1' }),
    )
    expect(result).toMatchObject({ ok: true })
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row?.state).toBe('issued')
  })

  it('a blocked gate returns its reason and a stale version asks for a reload', async () => {
    const app = await trade({ state: 'submitted' })
    state.actor = world.staff
    await actions.applyConditionAction(form({ applicationId: app.applicationId, code: 'LICENSE' }))
    const blocked = await actions.transitionAction(
      form({ applicationId: app.applicationId, to: 'issued', expectedRowVersion: '1' }),
    )
    expect(blocked).toMatchObject({
      ok: false,
      error: expect.stringContaining('Unmet conditions block issuance'),
    })
    const stale = await actions.transitionAction(
      form({ applicationId: app.applicationId, to: 'issued', expectedRowVersion: '9' }),
    )
    expect(stale).toMatchObject({ ok: false, error: expect.stringContaining('changed') })
  })

  it('gate override with a reason works, a statutory gate refuses a reason-only override, and staff cannot record an exception', async () => {
    const app = await trade({ state: 'submitted' })
    state.actor = world.staff
    await actions.applyConditionAction(form({ applicationId: app.applicationId, code: 'LICENSE' }))
    expect(
      await actions.overrideGateAction(
        form({
          applicationId: app.applicationId,
          gateKey: 'conditions.blocking_met',
          reason: 'License verified by phone',
        }),
      ),
    ).toMatchObject({ ok: true })
    expect(
      await handle.db
        .select()
        .from(gateOverrides)
        .where(eq(gateOverrides.applicationId, app.applicationId)),
    ).toHaveLength(1)
    expect(
      await actions.overrideGateAction(
        form({
          applicationId: app.applicationId,
          gateKey: 'nh.bp.regional_impact',
          reason: 'Please let it through',
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('legal authority') })
    expect(
      await actions.statutoryExceptionAction(
        form({
          applicationId: app.applicationId,
          gateKey: 'nh.bp.regional_impact',
          citation: 'Order',
          explanation: 'Stay',
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
  })

  it('an admin records a statutory exception with its citation', async () => {
    const app = await trade({ state: 'submitted' })
    state.actor = world.admin
    const result = await actions.statutoryExceptionAction(
      form({
        applicationId: app.applicationId,
        gateKey: 'nh.bp.regional_impact',
        citation: 'Superior Court order',
        explanation: 'Stay of review',
      }),
    )
    expect(result).toMatchObject({ ok: true })
    const [row] = await handle.db
      .select()
      .from(gateOverrides)
      .where(eq(gateOverrides.applicationId, app.applicationId))
    expect(row?.legalAuthority).toEqual({
      citation: 'Superior Court order',
      explanation: 'Stay of review',
    })
  })

  it('fee override needs fee.override and a reason, and takes dollars', async () => {
    const app = await trade()
    state.actor = world.reviewer
    expect(
      await actions.feeOverrideAction(
        form({
          applicationId: app.applicationId,
          feeCode: 'el',
          kind: 'waive',
          reason: 'Town-owned',
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
    state.actor = world.staff
    expect(
      await actions.feeOverrideAction(
        form({ applicationId: app.applicationId, feeCode: 'el', kind: 'waive', reason: ' ' }),
      ),
    ).toMatchObject({ ok: false, error: 'A reason is required.' })
    expect(
      await actions.feeOverrideAction(
        form({
          applicationId: app.applicationId,
          feeCode: 'el',
          kind: 'set_amount',
          amount: '30.00',
          reason: 'Hardship',
        }),
      ),
    ).toMatchObject({ ok: true })
    const [row] = await handle.db
      .select()
      .from(feeOverrides)
      .where(eq(feeOverrides.applicationId, app.applicationId))
    expect(row?.amountCents).toBe(3000)
    expect(
      await actions.feeOverrideAction(
        form({
          applicationId: app.applicationId,
          feeCode: 'el',
          kind: 'set_amount',
          amount: 'abc',
          reason: 'Hardship',
        }),
      ),
    ).toMatchObject({ ok: false })
  })

  it('clock adjustments are refused where the rule forbids them and need clock.adjust', async () => {
    const app = await makeApplication(handle.db, world, {
      state: 'under_review',
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
    const [clock] = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    const input = {
      clockId: clock?.id ?? '',
      kind: 'extension',
      days: '10',
      reason: 'Applicant asked',
    }
    state.actor = world.staff
    expect(await actions.adjustClockAction(form(input))).toMatchObject({
      ok: false,
      error: expect.stringContaining('cannot be extended'),
    })
    state.actor = world.reviewer
    expect(await actions.adjustClockAction(form(input))).toMatchObject({
      ok: false,
      error: expect.stringContaining('permission'),
    })
    state.actor = world.admin
    expect(
      await actions.adjustClockAction(
        form({
          ...input,
          kind: 'statutory_exception',
          citation: 'Court order',
          explanation: 'Stay',
        }),
      ),
    ).toMatchObject({ ok: true })
  })

  it('regional impact determination and notice need regional_impact.determine and certified mail', async () => {
    const app = await makeApplication(handle.db, world)
    state.actor = world.reviewer
    expect(
      await actions.regionalImpactAction(
        form({
          applicationId: app.applicationId,
          determination: 'yes',
          determinedOn: '2027-06-01',
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
    state.actor = world.staff
    expect(
      await actions.regionalImpactAction(
        form({
          applicationId: app.applicationId,
          determination: 'previously_determined',
          determinedOn: '2027-06-01',
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('board') })
    expect(
      await actions.regionalImpactAction(
        form({
          applicationId: app.applicationId,
          determination: 'yes',
          determinedOn: '2027-06-01',
        }),
      ),
    ).toMatchObject({ ok: true })
    const notice = {
      applicationId: app.applicationId,
      recipientKind: 'regional_planning_commission',
      recipientName: 'Alder Pond RPC',
      mailedOn: '2027-06-04',
    }
    expect(await actions.regionalNoticeAction(form({ ...notice, method: 'email' }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('certified mail'),
    })
    expect(
      await actions.regionalNoticeAction(form({ ...notice, method: 'certified_mail' })),
    ).toMatchObject({ ok: true })
  })

  it('an appeal suspends and an upheld resolution reinstates through server actions', async () => {
    const app = await trade({ state: 'issued', issuedOn: '2027-03-15' })
    state.actor = world.staff
    expect(
      await actions.recordAppealAction(
        form({
          applicationId: app.applicationId,
          filedOn: '2027-05-01',
          appellantName: 'Abutter Smith',
        }),
      ),
    ).toMatchObject({ ok: true })
    const [suspended] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(suspended?.state).toBe('suspended')
    expect(
      await actions.resolveAppealAction(
        form({
          applicationId: app.applicationId,
          resolvedOn: '2027-06-10',
          outcome: 'permit_upheld',
        }),
      ),
    ).toMatchObject({ ok: true })
    const [issued] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(issued?.state).toBe('issued')
  })

  it('invalid dates and ids are rejected before any change', async () => {
    state.actor = world.staff
    expect(
      await actions.markCompleteAction(
        form({ applicationId: 'not-a-uuid', completedDate: '2027-03-01' }),
      ),
    ).toMatchObject({ ok: false })
    expect(
      await actions.markCompleteAction(
        form({ applicationId: '00000000-0000-4000-8000-000000000000', completedDate: 'soon' }),
      ),
    ).toMatchObject({ ok: false, error: 'Enter a valid date.' })
  })
})
