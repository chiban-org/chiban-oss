import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  countRequestedInspections,
  countStopsOn,
  listMissingResults,
  upcomingInspectionDays,
} from '@/features/inspections/inspectorWork'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-07-01' as CivilDate
let handle: TestDb
let w: InspectionWorld
let missingOld = ''
let missingRecent = ''

let slot = 480

function booked(inspectorUserId: string, scheduledDate: string, status = 'scheduled' as const) {
  slot += 30
  return { inspectorUserId, scheduledDate, startMinute: slot, durationMinutes: 30, status }
}

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  const app = w.trade.applicationId
  const me = w.inspector.userId
  missingOld = await insertInspection(handle.db, app, 'rough', booked(me, '2027-06-20'))
  missingRecent = await insertInspection(handle.db, app, 'rough', booked(me, '2027-06-30'))
  await insertInspection(handle.db, app, 'rough', {
    ...booked(me, '2027-06-29'),
    status: 'passed',
    resultRecordedAt: new Date('2027-06-29T15:00:00Z'),
  })
  await insertInspection(handle.db, app, 'rough', booked(w.otherInspector.userId, '2027-06-25'))
  await insertInspection(handle.db, app, 'rough', booked(me, TODAY))
  await insertInspection(handle.db, app, 'rough', booked(me, TODAY))
  await insertInspection(handle.db, app, 'rough', booked(me, '2027-07-03'))
  await insertInspection(handle.db, app, 'rough', booked(me, '2027-07-06'))
  await insertInspection(handle.db, app, 'rough', booked(me, '2027-07-06'))
  await insertInspection(handle.db, app, 'rough', { status: 'requested' })
})
afterAll(async () => {
  await handle.drop()
})

describe('an inspector start page', () => {
  it('lists past inspections still waiting for a result, oldest first, for that inspector only', async () => {
    const missing = await listMissingResults(
      handle.db,
      w.inspector,
      { inspectorUserId: w.inspector.userId, today: TODAY, limit: 10 },
      signal,
    )
    expect(missing).toMatchObject({ ok: true, value: { total: 2 } })
    if (!missing.ok) return
    expect(missing.value.rows.map((r) => r.inspectionId)).toEqual([missingOld, missingRecent])
    expect(missing.value.rows[0]).toMatchObject({
      scheduledDate: '2027-06-20',
      applicationNumber: w.trade.number,
    })
  })

  it('refuses another inspector the list', async () => {
    const other = await listMissingResults(
      handle.db,
      w.otherInspector,
      { inspectorUserId: w.inspector.userId, today: TODAY, limit: 10 },
      signal,
    )
    expect(other).toEqual({ ok: false, error: 'forbidden' })
  })

  it('counts today, the next days with inspections, and the requests to schedule', async () => {
    const input = { inspectorUserId: w.inspector.userId, date: TODAY }
    expect(await countStopsOn(handle.db, w.inspector, input, signal)).toBe(2)
    expect(
      await upcomingInspectionDays(handle.db, w.inspector, { ...input, limit: 3 }, signal),
    ).toEqual([
      { date: '2027-07-03', count: 1 },
      { date: '2027-07-06', count: 2 },
    ])
    expect(await countRequestedInspections(handle.db, w.inspector, signal)).toBe(1)
  })
})
