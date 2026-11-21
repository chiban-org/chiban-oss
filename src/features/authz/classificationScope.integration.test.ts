import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inspections } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { actorMayMove } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { quickIssue } from '@/features/counter/quickIssue'
import { listInspectors, listInspectorsFor } from '@/features/inspections/availability'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { scheduleInspection } from '@/features/inspections/schedule'
import { setActivePackForTest } from '@/features/packs/registry'
import { mayCorrectPermits } from '@/features/permits/correction/policy'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import {
  issuedPlumbingPermit,
  PLUMBING_PACK,
  PLUMBING_TYPE,
  publishPlumbingType,
} from '@/test/plumbingFixtures'
import { staffWith } from '@/test/staffUsers'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld
let plumber: Actor
let plainInspector: Actor
let permitId: string
let buildingId: string

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  setActivePackForTest(PLUMBING_PACK)
  await publishPlumbingType(handle.db, w)
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
  plainInspector = await staffWith(handle.db, ['inspector'])
  permitId = (await issuedPlumbingPermit(handle.db, w)).applicationId
  buildingId = w.building.applicationId
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function mayMove(actor: Actor, applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('missing application')
  return await actorMayMove(handle.db, actor, app, 'issued', signal)
}

describe('issuing an owned classification', () => {
  it('only the plumbing inspector may move an owned permit to issued', async () => {
    expect(await mayMove(plumber, permitId)).toBe(true)
    expect(await mayMove(w.world.staff, permitId)).toBe(false)
    expect(await mayMove(w.world.admin, permitId)).toBe(false)
  })

  it('the plumbing inspector may not issue another classification', async () => {
    expect(await mayMove(plumber, buildingId)).toBe(false)
    expect(await mayMove(w.world.staff, buildingId)).toBe(true)
  })

  it('only the plumbing inspector may correct an owned permit', async () => {
    expect(await mayCorrectPermits(handle.db, plumber, permitId, signal)).toBe(true)
    expect(await mayCorrectPermits(handle.db, w.world.staff, permitId, signal)).toBe(false)
    expect(await mayCorrectPermits(handle.db, plumber, buildingId, signal)).toBe(false)
    expect(await mayCorrectPermits(handle.db, w.world.staff, buildingId, signal)).toBe(true)
  })
})

describe('the counter', () => {
  const input = {
    parcelId: '',
    applicationTypeKey: PLUMBING_TYPE,
    values: { description: 'Replace a drain line', contractor_license_number: 'PL-1' },
    contractor: { name: 'Pat Plumber' },
    payerName: 'Pat Plumber',
    payment: { method: 'cash' as const, tenderedCents: 100000 },
  }

  it('the plumbing inspector quick-issues an owned type and staff cannot', async () => {
    const parcelId = w.world.parcelId
    const refused = await quickIssue(handle.db, w.world.staff, { ...input, parcelId }, signal, {
      now: INSPECTION_NOW,
    })
    expect(refused).toEqual({ ok: false, error: 'forbidden' })
    const issued = await quickIssue(handle.db, plumber, { ...input, parcelId }, signal, {
      now: INSPECTION_NOW,
    })
    expect(issued.ok && issued.value.state).toBe('issued')
  })

  it('the plumbing inspector cannot quick-issue another classification', async () => {
    const refused = await quickIssue(
      handle.db,
      plumber,
      { ...input, parcelId: w.world.parcelId, applicationTypeKey: 'EL' },
      signal,
      { now: INSPECTION_NOW },
    )
    expect(refused).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('inspections of an owned classification', () => {
  async function book(actor: Actor, inspectionId: string, inspectorUserId: string) {
    const [current] = await handle.db
      .select({ rowVersion: inspections.rowVersion })
      .from(inspections)
      .where(eq(inspections.id, inspectionId))
    return await scheduleInspection(
      handle.db,
      actor,
      {
        inspectionId,
        inspectorUserId,
        date: civil('2027-07-08'),
        startMinute: 570,
        expectedRowVersion: current?.rowVersion ?? 0,
      },
      signal,
      { now: INSPECTION_NOW },
    )
  }

  it('the plumbing inspector schedules and takes an owned inspection', async () => {
    const id = await insertInspection(handle.db, permitId, 'rough')
    expect(await book(plumber, id, plumber.userId)).toMatchObject({ ok: true })
  })

  it('staff and plain inspectors cannot schedule an owned inspection', async () => {
    const id = await insertInspection(handle.db, permitId, 'rough')
    expect(await book(w.world.staff, id, plumber.userId)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await book(plainInspector, id, plumber.userId)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('an inspector without the role cannot be assigned an owned inspection', async () => {
    const id = await insertInspection(handle.db, permitId, 'rough')
    expect(await book(plumber, id, plainInspector.userId)).toEqual({
      ok: false,
      error: 'not_an_inspector',
    })
  })

  it('the plumbing inspector cannot schedule or be assigned another classification', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    expect(await book(plumber, id, plainInspector.userId)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await book(w.world.staff, id, plumber.userId)).toEqual({
      ok: false,
      error: 'not_an_inspector',
    })
  })

  it('only the plumbing inspector records an owned result', async () => {
    const id = await scheduledInspection(handle.db, plumber, permitId, 'rough')
    const input = {
      inspectionId: id,
      result: 'failed' as const,
      items: [],
      expectedRowVersion: 0,
    }
    const denied = await recordInspectionResult(handle.db, plainInspector, input, signal, {
      now: INSPECTION_NOW,
    })
    expect(denied).toEqual({ ok: false, error: 'forbidden' })
    const allowed = await recordInspectionResult(handle.db, plumber, input, signal, {
      now: INSPECTION_NOW,
    })
    expect(allowed.ok || allowed.error !== 'forbidden').toBe(true)
  })

  it('the scheduling board lists both kinds of inspector', async () => {
    const ids = (await listInspectors(handle.db, signal)).map((i) => i.userId)
    expect(ids).toEqual(expect.arrayContaining([plumber.userId, plainInspector.userId]))
  })

  it('lists only the plumbing inspectors for an owned classification', async () => {
    const owned = (await listInspectorsFor(handle.db, 'xx.internal_plumbing', signal)).map(
      (i) => i.userId,
    )
    expect(owned).toContain(plumber.userId)
    expect(owned).not.toContain(plainInspector.userId)
    const other = (await listInspectorsFor(handle.db, 'xx.building_permit', signal)).map(
      (i) => i.userId,
    )
    expect(other).toContain(plainInspector.userId)
    expect(other).not.toContain(plumber.userId)
  })
})
