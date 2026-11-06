import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { getDayList } from '@/features/inspections/dayList'
import { loadInspectorSection } from '@/features/staffHome/inspectorHome'
import { makeTestDb, type TestDb } from '@/test/db'
import { homeContextFor, rowCount, searchOf } from '@/test/homeFixtures'
import {
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'
import { parseCivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const EVENING_IN_TOWN = new Date('2027-07-02T02:00:00Z')
const TODAY = '2027-07-01'
const REQUESTS = 'Requests to schedule'
let handle: TestDb
let w: InspectionWorld
let slot = 480

function booked(inspector: Actor, scheduledDate: string) {
  slot += 60
  return {
    status: 'scheduled' as const,
    inspectorUserId: inspector.userId,
    scheduledDate,
    startMinute: slot,
    durationMinutes: 60,
  }
}

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
  const app = w.trade.applicationId
  await insertInspection(handle.db, app, 'rough', booked(w.inspector, TODAY))
  await insertInspection(handle.db, app, 'rough', {
    ...booked(w.inspector, TODAY),
    status: 'passed',
  })
  await insertInspection(handle.db, app, 'rough', {
    ...booked(w.inspector, TODAY),
    status: 'cancelled',
  })
  await insertInspection(handle.db, app, 'rough', booked(w.inspector, '2027-07-02'))
  await insertInspection(handle.db, app, 'rough', booked(w.otherInspector, TODAY))
  await insertInspection(handle.db, app, 'rough', { status: 'requested' })
})
afterAll(async () => {
  await handle.drop()
})

async function dayRows(href: string, actor: Actor): Promise<number> {
  const search = searchOf(href)
  const date = parseCivilDate(search.date?.[0] ?? '')
  if (!date.ok) throw new Error('no date in the link')
  const inspectorUserId = search.inspector?.[0] ?? ''
  const list = await getDayList(handle.db, actor, { inspectorUserId, date: date.value }, signal)
  if (!list.ok) throw new Error(list.error)
  return list.value.length
}

describe("today's inspections on a scheduler's Today", () => {
  it("counts each inspector's stops today and links to that inspector's day with the same rows", async () => {
    const ctx = await homeContextFor(handle.db, w.world.staff, EVENING_IN_TOWN)
    expect(ctx.today).toBe(TODAY)
    const section = await loadInspectorSection(ctx)
    const perInspector = (section?.rows ?? []).filter((row) => row.href.includes('inspector='))
    const counts = new Map(
      perInspector.map((row) => [searchOf(row.href).inspector?.[0], row.count]),
    )
    expect(counts).toEqual(
      new Map([
        [w.inspector.userId, 2],
        [w.otherInspector.userId, 1],
      ]),
    )
    for (const row of perInspector) {
      expect(await dayRows(row.href, w.world.staff)).toBe(row.count)
    }
    expect(rowCount(section, REQUESTS)).toBe(1)
  })

  it("keeps an inspector's own day for an inspector", async () => {
    const section = await loadInspectorSection(
      await homeContextFor(handle.db, w.inspector, EVENING_IN_TOWN),
    )
    expect(rowCount(section, "Stops on today's route")).toBe(2)
    expect(section?.rows.some((row) => row.href.includes('/staff/enforcement'))).toBe(false)
  })

  it('is absent for a viewer who cannot schedule or record inspections', async () => {
    const admin = await staffActor(handle.db, 'admin')
    expect(
      await loadInspectorSection(await homeContextFor(handle.db, admin, EVENING_IN_TOWN)),
    ).toBeNull()
  })
})
