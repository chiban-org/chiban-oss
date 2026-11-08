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
    const board = await loadScheduleBoard(handle.db, clerk, signal, INSPECTION_NOW)
    if (!board.ok) throw new Error('forbidden')
    expect(board.value.owedCount).toBe(3)
  })
})
