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

const actions = {
  ...(await import('@/app/(staff)/staff/applications/[applicationId]/actions')),
  ...(await import('@/app/(staff)/staff/applications/[applicationId]/clockFeeActions')),
  ...(await import('@/app/(staff)/staff/applications/[applicationId]/buildingActions')),
}

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

async function trade(patch: Parameters<typeof makeApplication>[2] = {}) {
  return await makeApplication(
    handle.db,
    world,
    { values: { description: 'Panel', contractor_license_number: 'EL-1' }, ...patch },
    undefined,
    'EL',
  )
}

describe('application building actions', () => {
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
