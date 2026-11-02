import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { inspections } from '@/db/schema'
import { getDayList } from '@/features/inspections/dayList'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  civil,
  type InspectionWorld,
  insertInspection,
  newIssuedPermit,
  RESULT_NOW,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld
let mine: Awaited<ReturnType<typeof staffActor>>
let theirs: Awaited<ReturnType<typeof staffActor>>

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  mine = await staffActor(handle.db, 'inspector')
  theirs = await staffActor(handle.db, 'inspector')
  const permit = await newIssuedPermit(handle.db, w, 'EL')
  const slot = (
    inspector: typeof mine,
    start: number,
    patch: Partial<typeof inspections.$inferInsert> = {},
  ) =>
    insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'scheduled',
      inspectorUserId: inspector.userId,
      scheduledDate: '2027-07-07',
      startMinute: start,
      durationMinutes: 60,
      contactPhone: '603-555-0100',
      ...patch,
    })
  await slot(mine, 690)
  await slot(mine, 570)
  await slot(theirs, 630)
  await slot(mine, 570, { scheduledDate: '2027-07-09' })
})
afterAll(async () => {
  await handle.drop()
})

const day = (inspectorUserId: string, date = '2027-07-07') => ({
  inspectorUserId,
  date: civil(date),
})

describe('inspector day list', () => {
  it('day list orders stops by start time', async () => {
    const r = await getDayList(handle.db, mine, day(mine.userId), signal, { now: RESULT_NOW })
    expect(r.ok && r.value.map((s) => s.startMinute)).toEqual([570, 690])
    expect(r.ok && r.value[0]).toMatchObject({
      typeLabel: 'Rough',
      contactPhone: '603-555-0100',
      status: 'scheduled',
      isReinspection: false,
    })
  })

  it("an inspector cannot read another inspector's list", async () => {
    expect(
      await getDayList(handle.db, mine, day(theirs.userId), signal, { now: RESULT_NOW }),
    ).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it("staff with inspection.schedule can read any inspector's list", async () => {
    const r = await getDayList(handle.db, w.world.staff, day(theirs.userId), signal, {
      now: RESULT_NOW,
    })
    expect(r.ok && r.value.map((s) => s.startMinute)).toEqual([630])
  })

  it('finance, reviewers, and public users cannot read a list', async () => {
    for (const actor of [w.finance, w.world.reviewer, w.world.applicant]) {
      const r = await getDayList(handle.db, actor, day(mine.userId), signal, { now: RESULT_NOW })
      expect(r).toEqual({ ok: false, error: 'forbidden' })
    }
  })

  it('a reinspection stop carries the previous failure notes', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const failed = await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'failed',
      resultNotes: 'Secure the panel box',
    })
    await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'scheduled',
      inspectorUserId: mine.userId,
      scheduledDate: '2027-07-14',
      startMinute: 570,
      durationMinutes: 60,
      reinspectionOf: failed,
    })
    const r = await getDayList(handle.db, mine, day(mine.userId, '2027-07-14'), signal, {
      now: RESULT_NOW,
    })
    expect(r.ok && r.value[0]).toMatchObject({
      isReinspection: true,
      previousFailureNotes: 'Secure the panel box',
    })
  })

  it('cancelled inspections do not appear', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    await insertInspection(handle.db, permit.applicationId, 'rough', {
      status: 'cancelled',
      inspectorUserId: mine.userId,
      scheduledDate: '2027-07-21',
      startMinute: 570,
      durationMinutes: 60,
    })
    const r = await getDayList(handle.db, mine, day(mine.userId, '2027-07-21'), signal, {
      now: RESULT_NOW,
    })
    expect(r).toEqual({ ok: true, value: [] })
  })
})
