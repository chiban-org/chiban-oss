import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { configVersions, inspections, inspectorCalendars } from '@/db/schema'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  checklistIdFor,
  type InspectionWorld,
  insertInspection,
  newIssuedPermit,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'

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
vi.mock('@/features/town/today', async (original) => ({
  ...(await original<typeof import('@/features/town/today')>()),
  townToday: () => Promise.resolve('2027-07-01'),
}))

const actions = await import('@/app/(staff)/staff/inspections/actions')

let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  state.actor = w.world.staff
})

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

function booking(id: string, extra: Record<string, string>): FormData {
  return form({
    inspectionId: id,
    inspectorUserId: w.inspector.userId,
    date: '2027-07-07',
    startMinute: '600',
    expectedRowVersion: '1',
    ...extra,
  })
}

const NEEDS_REASON = 'That start time is not one of the town slots. Add a reason to book it anyway.'

describe('booking outside the town slots', () => {
  it('asks for a reason beside the reason field when the time is off the grid', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    expect(await actions.scheduleInspectionAction(booking(id, {}))).toEqual({
      ok: false,
      error: NEEDS_REASON,
      fieldErrors: { offGridReason: NEEDS_REASON },
    })
  })

  it('refuses a reason that is too short to count', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    const copy = 'Write a reason of at least 10 characters.'
    expect(
      await actions.scheduleInspectionAction(booking(id, { offGridReason: 'too short' })),
    ).toEqual({ ok: false, error: copy, fieldErrors: { offGridReason: copy } })
  })

  it('refuses a past day beside the date even with a reason', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    const copy = 'That day has already passed. Choose today or a later day.'
    expect(
      await actions.scheduleInspectionAction(
        booking(id, { date: '2027-06-30', offGridReason: 'Contractor asked for it' }),
      ),
    ).toEqual({ ok: false, error: copy, fieldErrors: { date: copy } })
  })

  it('books with a reason and keeps the reason on the inspection', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    const reason = 'Contractor can only meet at ten'
    expect(
      await actions.scheduleInspectionAction(booking(id, { offGridReason: reason })),
    ).toMatchObject({ ok: true })
    const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
    expect(row?.offGridReason).toBe(reason)
  })
})
