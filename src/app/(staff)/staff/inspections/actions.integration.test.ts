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

const ALL = {
  requestInspectionAction: actions.requestInspectionAction,
  scheduleInspectionAction: actions.scheduleInspectionAction,
  cancelInspectionAction: actions.cancelInspectionAction,
  issueCertificateAction: actions.issueCertificateAction,
  saveInspectorCalendarAction: actions.saveInspectorCalendarAction,
  saveCalendarAccountAction: actions.saveCalendarAccountAction,
  publishInspectionSettingsAction: actions.publishInspectionSettingsAction,
}

describe('staff inspection actions', () => {
  it.each(Object.entries(ALL))('%s rejects a missing csrf token', async (_n, action) => {
    state.actor = w.world.admin
    expect(await action(form({}, null))).toMatchObject({ ok: false })
  })

  it('schedule action without csrf is refused and changes nothing', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    const r = await actions.scheduleInspectionAction(
      form(
        {
          inspectionId: id,
          inspectorUserId: w.inspector.userId,
          date: '2027-07-07',
          startMinute: '570',
          expectedRowVersion: '1',
        },
        null,
      ),
    )
    expect(r).toMatchObject({ ok: false })
    const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
    expect(row?.status).toBe('requested')
  })

  it('schedule action as finance is forbidden', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    state.actor = w.finance
    const r = await actions.scheduleInspectionAction(
      form({
        inspectionId: id,
        inspectorUserId: w.inspector.userId,
        date: '2027-07-07',
        startMinute: '570',
        expectedRowVersion: '1',
      }),
    )
    expect(r).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })

  it('staff take a phone request and schedule it', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const requested = await actions.requestInspectionAction(
      form({
        applicationId: permit.applicationId,
        checklistVersionId: await checklistIdFor(handle.db, permit.applicationId, 'rough'),
        channel: 'phone',
        contactName: 'Pat Contact',
        contactPhone: '603-555-0100',
      }),
    )
    expect(requested).toMatchObject({ ok: true })
    const [row] = await handle.db
      .select()
      .from(inspections)
      .where(eq(inspections.applicationId, permit.applicationId))
    expect(row).toMatchObject({
      channel: 'phone',
      status: 'requested',
      contactPhone: '603-555-0100',
    })
    const scheduled = await actions.scheduleInspectionAction(
      form({
        inspectionId: row?.id ?? '',
        inspectorUserId: w.inspector.userId,
        date: '2027-07-12',
        startMinute: '630',
        expectedRowVersion: String(row?.rowVersion),
      }),
    )
    expect(scheduled).toMatchObject({ ok: true })
  })

  it('malformed requests are refused before the database', async () => {
    const r = await actions.requestInspectionAction(
      form({
        applicationId: 'x',
        checklistVersionId: 'y',
        channel: 'carrier-pigeon',
        contactName: '',
      }),
    )
    expect(r).toEqual({
      ok: false,
      error:
        'Choose a permit. Choose an inspection. Choose how the request came in. Enter the contact name.',
      fieldErrors: {
        applicationId: 'Choose a permit.',
        checklistVersionId: 'Choose an inspection.',
        channel: 'Choose how the request came in.',
        contactName: 'Enter the contact name.',
      },
    })
  })

  it('a slot already taken says so', async () => {
    const a = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    const b = await insertInspection(handle.db, w.trade.applicationId, 'rough')
    const slot = { inspectorUserId: w.inspector.userId, date: '2027-07-14', startMinute: '570' }
    expect(
      await actions.scheduleInspectionAction(
        form({ inspectionId: a, expectedRowVersion: '1', ...slot }),
      ),
    ).toMatchObject({ ok: true })
    expect(
      await actions.scheduleInspectionAction(
        form({ inspectionId: b, expectedRowVersion: '1', ...slot }),
      ),
    ).toEqual({ ok: false, error: 'That time was just taken. Pick another.' })
  })

  it('settings publish as staff without config.edit is forbidden', async () => {
    const body = JSON.stringify({
      key: 'default',
      schedulingDays: [1, 3, 5],
      windowStartMinute: 570,
      windowEndMinute: 930,
      slotMinutes: 60,
      minNoticeDays: 1,
      horizonDays: 30,
      maxPerInspectorPerDay: 6,
      phoneRequestHours: { days: [1, 2, 3, 4, 5], startMinute: 480, endMinute: 720 },
      portalRequestsEnabled: true,
    })
    const r = await actions.publishInspectionSettingsAction(form({ body }))
    expect(r).toMatchObject({ ok: false })
    state.actor = w.world.admin
    const ok = await actions.publishInspectionSettingsAction(form({ body }))
    expect(ok).toMatchObject({ ok: true })
    const rows = await handle.db
      .select()
      .from(configVersions)
      .where(eq(configVersions.kind, 'inspection_settings'))
    expect(rows.filter((v) => v.status === 'published')).toHaveLength(1)
  })

  it('settings with a window that does not divide into slots show the error beside the field', async () => {
    state.actor = w.world.admin
    const body = JSON.stringify({
      key: 'default',
      schedulingDays: [1],
      windowStartMinute: 570,
      windowEndMinute: 930,
      slotMinutes: 50,
      minNoticeDays: 1,
      horizonDays: 30,
      maxPerInspectorPerDay: 6,
      phoneRequestHours: { days: [1], startMinute: 480, endMinute: 720 },
      portalRequestsEnabled: true,
    })
    const r = await actions.publishInspectionSettingsAction(form({ body }))
    expect(r).toMatchObject({ ok: false, fieldErrors: { slotMinutes: expect.any(String) } })
  })

  it('saving an inspector calendar needs config.edit', async () => {
    const fields = {
      userId: w.inspector.userId,
      kind: 'ics_email',
      email: 'field@alderpond.example',
    }
    expect(await actions.saveInspectorCalendarAction(form(fields))).toEqual({
      ok: false,
      error: 'You do not have permission to do this.',
    })
    state.actor = w.world.admin
    expect(await actions.saveInspectorCalendarAction(form(fields))).toMatchObject({ ok: true })
    const [row] = await handle.db
      .select()
      .from(inspectorCalendars)
      .where(eq(inspectorCalendars.userId, w.inspector.userId))
    expect(row).toMatchObject({ kind: 'ics_email', email: 'field@alderpond.example' })
  })

  it('an inspector may not issue a certificate', async () => {
    state.actor = w.inspector
    const r = await actions.issueCertificateAction(
      form({
        applicationId: w.building.applicationId,
        issuedOn: '2027-07-01',
        expectedRowVersion: '1',
      }),
    )
    expect(r).toEqual({ ok: false, error: 'You do not have permission to do this.' })
  })
})
