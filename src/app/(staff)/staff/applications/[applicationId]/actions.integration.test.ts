import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applicationConditions,
  applications,
  clocks,
  feeOverrides,
  gateOverrides,
} from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { recordActiveLicense } from '@/test/licenseFixtures'
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

const actions = {
  ...(await import('@/app/(staff)/staff/applications/[applicationId]/actions')),
  ...(await import('@/app/(staff)/staff/applications/[applicationId]/gateActions')),
  ...(await import('@/app/(staff)/staff/applications/[applicationId]/conditionActions')),
  ...(await import('@/app/(staff)/staff/applications/[applicationId]/clockFeeActions')),
  ...(await import('@/app/(staff)/staff/applications/[applicationId]/buildingActions')),
}

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
  const made = await makeApplication(
    handle.db,
    world,
    { values: { description: 'Panel', contractor_license_number: 'EL-1' }, ...patch },
    undefined,
    'EL',
  )
  await recordActiveLicense(handle.db, made.applicationId, world.staff.userId)
  return made
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

  it('reviewer issuing through the server action is forbidden', async () => {
    const app = await trade({ state: 'submitted' })
    state.actor = world.reviewer
    const result = await actions.transitionAction(
      form({ applicationId: app.applicationId, to: 'issued', expectedRowVersion: '1' }),
    )
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
  })

  it('waiving a blocking condition without gate.override_admin is forbidden through the action', async () => {
    const app = await trade({ state: 'submitted' })
    state.actor = world.staff
    await actions.applyConditionAction(form({ applicationId: app.applicationId, code: 'LICENSE' }))
    const [condition] = await handle.db
      .select()
      .from(applicationConditions)
      .where(eq(applicationConditions.applicationId, app.applicationId))
    state.actor = await staffActor(handle.db, 'inspector')
    const result = await actions.setConditionStatusAction(
      form({
        conditionId: condition?.id ?? '',
        status: 'waived',
        reason: 'Not needed on this job',
      }),
    )
    expect(result).toMatchObject({ ok: false })
    const [after] = await handle.db
      .select()
      .from(applicationConditions)
      .where(eq(applicationConditions.id, condition?.id ?? ''))
    expect(after?.status).toBe('unmet')
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
})
