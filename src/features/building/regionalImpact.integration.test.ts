import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import {
  recordRegionalImpactDetermination,
  recordRegionalImpactNotice,
} from '@/features/building/regionalImpact'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
})
afterEach(async () => {
  await handle.drop()
})

const KEY = 'nh.bp.regional_impact'

async function gate(applicationId: string, today: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('missing')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, 'issued', d(today), signal),
  )
  return results.find((g) => g.key === KEY)
}

async function determine(
  applicationId: string,
  determination: 'yes' | 'no' | 'previously_determined',
  extra: { previousBoardRef?: string } = {},
  actor = world.staff,
) {
  return await recordRegionalImpactDetermination(
    handle.db,
    actor,
    { applicationId, determination, determinedOn: d('2027-06-01'), ...extra },
    signal,
  )
}

async function notify(
  applicationId: string,
  mailedOn: string,
  method: 'certified_mail' | 'email' = 'certified_mail',
  recipientKind:
    | 'regional_planning_commission'
    | 'governing_body'
    | 'affected_municipality' = 'regional_planning_commission',
) {
  return await recordRegionalImpactNotice(
    handle.db,
    world.staff,
    {
      applicationId,
      recipientKind,
      recipientName: 'Alder Pond Regional Planning Commission',
      method,
      mailedOn: d(mailedOn),
    },
    signal,
  )
}

async function commentClocks(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.filter((c) => c.ruleKey === 'nh.bp.regional_impact_comment')
}

describe('regional impact determination', () => {
  it('no determination blocks issuance as unknown', async () => {
    const app = await makeApplication(handle.db, world)
    const result = await gate(app.applicationId, '2027-06-02')
    expect(result).toMatchObject({
      kind: 'statutory',
      effective: 'blocked',
      outcome: {
        status: 'unknown',
        reason: 'Regional impact determination not recorded (RSA 36:57 IV).',
      },
    })
  })

  it('determination no passes', async () => {
    const app = await makeApplication(handle.db, world)
    expect((await determine(app.applicationId, 'no')).ok).toBe(true)
    expect((await gate(app.applicationId, '2027-06-02'))?.effective).toBe('pass')
  })

  it('previously determined without a board reference is refused', async () => {
    const app = await makeApplication(handle.db, world)
    expect(await determine(app.applicationId, 'previously_determined')).toEqual({
      ok: false,
      error: 'board_ref_required',
    })
    expect(
      (
        await determine(app.applicationId, 'previously_determined', {
          previousBoardRef: 'PB 2026-014',
        })
      ).ok,
    ).toBe(true)
    expect((await gate(app.applicationId, '2027-06-02'))?.effective).toBe('pass')
  })

  it('a reviewer recording a determination is forbidden', async () => {
    const app = await makeApplication(handle.db, world)
    expect(await determine(app.applicationId, 'no', {}, world.reviewer)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('an inspector may record a determination', async () => {
    const app = await makeApplication(handle.db, world)
    const inspector = await staffActor(handle.db, 'inspector')
    expect((await determine(app.applicationId, 'no', {}, inspector)).ok).toBe(true)
  })

  it('a determination cannot change once the permit is issued or closed', async () => {
    for (const state of ['issued', 'closed'] as const) {
      const app = await makeApplication(handle.db, world, { state })
      expect(await determine(app.applicationId, 'yes')).toEqual({
        ok: false,
        error: 'after_issuance',
      })
    }
  })

  it('a notice cannot be recorded once the permit is issued', async () => {
    const app = await makeApplication(handle.db, world)
    await determine(app.applicationId, 'yes')
    await handle.db
      .update(applications)
      .set({ state: 'issued' })
      .where(eq(applications.id, app.applicationId))
    expect(await notify(app.applicationId, '2027-06-02')).toEqual({
      ok: false,
      error: 'after_issuance',
    })
  })

  it('a yes with no certified commission notice is blocked', async () => {
    const app = await makeApplication(handle.db, world)
    await determine(app.applicationId, 'yes')
    expect((await gate(app.applicationId, '2027-06-02'))?.outcome).toEqual({
      status: 'blocked',
      reason: 'Regional planning commission not yet notified by certified mail.',
    })
  })
})

describe('regional impact notices', () => {
  it('notice before a yes determination is no_yes_determination', async () => {
    const app = await makeApplication(handle.db, world)
    expect(await notify(app.applicationId, '2027-06-04')).toEqual({
      ok: false,
      error: 'no_yes_determination',
    })
    await determine(app.applicationId, 'no')
    expect(await notify(app.applicationId, '2027-06-04')).toEqual({
      ok: false,
      error: 'no_yes_determination',
    })
  })

  it('commission notice by email is certified_mail_required', async () => {
    const app = await makeApplication(handle.db, world)
    await determine(app.applicationId, 'yes')
    expect(await notify(app.applicationId, '2027-06-04', 'email')).toEqual({
      ok: false,
      error: 'certified_mail_required',
    })
    expect(await notify(app.applicationId, '2027-06-04', 'email', 'affected_municipality')).toEqual(
      { ok: false, error: 'certified_mail_required' },
    )
    expect((await notify(app.applicationId, '2027-06-04', 'email', 'governing_body')).ok).toBe(true)
    expect(await commentClocks(app.applicationId)).toHaveLength(0)
  })

  it('certified notice mailed 2027-06-04 blocks through 2027-07-06 and passes on 2027-07-07', async () => {
    const app = await makeApplication(handle.db, world)
    await determine(app.applicationId, 'yes')
    await notify(app.applicationId, '2027-06-04')
    const [clock] = await commentClocks(app.applicationId)
    expect(clock).toMatchObject({ computedDue: '2027-07-06', rolledFrom: '2027-07-04' })
    expect((await gate(app.applicationId, '2027-07-06'))?.outcome).toEqual({
      status: 'blocked',
      reason: 'Comment period open through July 6, 2027.',
    })
    expect((await gate(app.applicationId, '2027-07-07'))?.effective).toBe('pass')
  })

  it('later certified notice mailed 2027-06-10 moves the end to 2027-07-12 and supersedes the first clock', async () => {
    const app = await makeApplication(handle.db, world)
    await determine(app.applicationId, 'yes')
    await notify(app.applicationId, '2027-06-04')
    await notify(app.applicationId, '2027-06-10', 'certified_mail', 'affected_municipality')
    const clockRows = await commentClocks(app.applicationId)
    expect(clockRows).toHaveLength(2)
    const first = clockRows.find((c) => c.startDate === '2027-06-04')
    const second = clockRows.find((c) => c.startDate === '2027-06-10')
    expect(first).toMatchObject({
      status: 'superseded',
      supersededReason: 'later_certified_notice',
      supersededBy: second?.id,
    })
    expect(second).toMatchObject({ status: 'running', computedDue: '2027-07-12' })
    expect((await gate(app.applicationId, '2027-07-12'))?.effective).toBe('blocked')
    expect((await gate(app.applicationId, '2027-07-13'))?.effective).toBe('pass')
  })

  it('an earlier backfilled notice does not move the comment period', async () => {
    const app = await makeApplication(handle.db, world)
    await determine(app.applicationId, 'yes')
    await notify(app.applicationId, '2027-06-10')
    await notify(app.applicationId, '2027-06-04', 'certified_mail', 'affected_municipality')
    const rows = await commentClocks(app.applicationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.startDate).toBe('2027-06-10')
  })

  it('a reviewer recording a notice is forbidden', async () => {
    const app = await makeApplication(handle.db, world)
    await determine(app.applicationId, 'yes')
    const r = await recordRegionalImpactNotice(
      handle.db,
      world.reviewer,
      {
        applicationId: app.applicationId,
        recipientKind: 'regional_planning_commission',
        recipientName: 'RPC',
        method: 'certified_mail',
        mailedOn: d('2027-06-04'),
      },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('binding', () => {
  it('trade permit issuance ignores the regional impact gate', async () => {
    const app = await makeApplication(handle.db, world, { state: 'submitted' }, undefined, 'EL')
    const app2 = await loadApplicationContext(handle.db, app.applicationId, signal)
    if (app2 === null) throw new Error('missing')
    const results = await handle.db.transaction((tx) =>
      evaluateGates(tx, app2, 'issued', d('2027-06-02'), signal),
    )
    expect(results.map((r) => r.key)).not.toContain(KEY)
  })
})
