import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { loadScheduleBoard } from '@/features/inspections/boardData'
import { listOwedResults } from '@/features/inspections/owedResults'
import { townToday } from '@/features/town/today'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld
let clerk: Actor
let today = '2027-07-01' as CivilDate
let oldest = ''
let newest = ''
let otherInspectors = ''

let slot = 480

function booked(inspectorUserId: string, scheduledDate: string, status = 'scheduled' as const) {
  slot += 30
  return { inspectorUserId, scheduledDate, startMinute: slot, durationMinutes: 30, status }
}

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  clerk = await staffActor(handle.db, 'staff')
  today = await townToday(handle.db, INSPECTION_NOW, signal)
  const app = w.trade.applicationId
  newest = await insertInspection(
    handle.db,
    app,
    'rough',
    booked(w.inspector.userId, addDays(today, -1)),
  )
  oldest = await insertInspection(
    handle.db,
    app,
    'rough',
    booked(w.inspector.userId, addDays(today, -9)),
  )
  otherInspectors = await insertInspection(
    handle.db,
    app,
    'rough',
    booked(w.otherInspector.userId, addDays(today, -4)),
  )
  await insertInspection(handle.db, app, 'rough', booked(w.inspector.userId, today))
  await insertInspection(handle.db, app, 'rough', booked(w.inspector.userId, addDays(today, 2)))
  await insertInspection(handle.db, app, 'rough', {
    ...booked(w.inspector.userId, addDays(today, -2)),
    status: 'passed',
    resultRecordedAt: new Date('2027-06-29T15:00:00Z'),
  })
  await insertInspection(handle.db, app, 'rough', { status: 'requested' })
})
afterAll(async () => {
  await handle.drop()
})

describe('listOwedResults', () => {
  it('lists every scheduled inspection dated before today across inspectors, oldest first', async () => {
    const owed = await listOwedResults(handle.db, clerk, today, signal)
    if (!owed.ok) throw new Error('forbidden')
    expect(owed.value.map((r) => r.inspectionId)).toEqual([oldest, otherInspectors, newest])
    expect(owed.value.map((r) => r.daysLate)).toEqual([9, 4, 1])
    expect(owed.value[0]).toMatchObject({
      applicationNumber: w.trade.number,
      typeLabel: 'Rough',
      inspectorName: expect.any(String),
    })
  })

  it('refuses someone who may not schedule', async () => {
    const owed = await listOwedResults(handle.db, w.finance, today, signal)
    expect(owed).toEqual({ ok: false, error: 'forbidden' })
  })

  it('counts them on the schedule board', async () => {
    const board = await loadScheduleBoard(handle.db, clerk, signal, { now: INSPECTION_NOW })
    if (!board.ok) throw new Error('forbidden')
    expect(board.value.owedCount).toBe(3)
  })

  it('leaves owed bookings off the board unless one is asked for by id', async () => {
    const plain = await loadScheduleBoard(handle.db, clerk, signal, { now: INSPECTION_NOW })
    if (!plain.ok) throw new Error('forbidden')
    expect(plain.value.bookings.map((r) => r.inspectionId)).not.toContain(oldest)
    expect(plain.value.bookings.every((r) => r.date >= today)).toBe(true)
    const pinned = await loadScheduleBoard(handle.db, clerk, signal, {
      now: INSPECTION_NOW,
      pinnedId: oldest,
    })
    if (!pinned.ok) throw new Error('forbidden')
    const row = pinned.value.bookings.find((r) => r.inspectionId === oldest)
    expect(row).toMatchObject({
      date: addDays(today, -9),
      inspectorUserId: w.inspector.userId,
      applicationNumber: w.trade.number,
      typeLabel: 'Rough',
    })
    expect(pinned.value.requests.map((r) => r.inspectionId)).not.toContain(oldest)
    expect(pinned.value.bookings.map((r) => r.inspectionId)).not.toContain(newest)
  })

  it('carries each booking from today on with its inspector, date and minute', async () => {
    const board = await loadScheduleBoard(handle.db, clerk, signal, { now: INSPECTION_NOW })
    if (!board.ok) throw new Error('forbidden')
    expect(board.value.bookings.map((r) => r.date).sort()).toEqual([today, addDays(today, 2)])
    expect(board.value.bookings[0]).toMatchObject({
      inspectorUserId: w.inspector.userId,
      inspectorName: expect.any(String),
      startMinute: expect.any(Number),
      durationMinutes: 30,
    })
  })
})
