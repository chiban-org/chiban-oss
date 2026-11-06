import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { inspections } from '@/db/schema'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type InspectionWorld,
  newIssuedPermit,
  RESULT_NOW,
  scheduledInspection,
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
  townToday: () => Promise.resolve('2027-07-07'),
}))

const actions = await import('@/app/(staff)/staff/inspections/[inspectionId]/actions')

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
  state.actor = w.inspector
})

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

async function target() {
  const permit = await newIssuedPermit(handle.db, w, 'EL')
  const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
  const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
  return { id, rowVersion: row?.rowVersion ?? 1 }
}

const ALL = {
  recordResultAction: actions.recordResultAction,
  createPhotoUploadIntentAction: actions.createPhotoUploadIntentAction,
  finalizePhotoUploadAction: actions.finalizePhotoUploadAction,
}

describe('inspection actions', () => {
  it.each(Object.entries(ALL))('%s rejects a missing csrf token', async (_name, action) => {
    expect(await action(form({}, null))).toMatchObject({ ok: false })
  })

  it('record result action without csrf is refused and records nothing', async () => {
    const t = await target()
    const r = await actions.recordResultAction(
      form(
        {
          inspectionId: t.id,
          expectedRowVersion: String(t.rowVersion),
          result: 'passed',
          'item:rough-1': 'pass',
        },
        null,
      ),
    )
    expect(r).toMatchObject({ ok: false })
    const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, t.id))
    expect(row?.status).toBe('scheduled')
  })

  it('records a passed result for the assigned inspector', async () => {
    const t = await target()
    const r = await actions.recordResultAction(
      form({
        inspectionId: t.id,
        expectedRowVersion: String(t.rowVersion),
        result: 'passed',
        'item:rough-1': 'pass',
      }),
    )
    expect(r).toMatchObject({ ok: true })
    const [row] = await handle.db.select().from(inspections).where(eq(inspections.id, t.id))
    expect(row?.status).toBe('passed')
  })

  it('a stale version says the inspection changed', async () => {
    const t = await target()
    const r = await actions.recordResultAction(
      form({
        inspectionId: t.id,
        expectedRowVersion: '99',
        result: 'passed',
        'item:rough-1': 'pass',
      }),
    )
    expect(r).toEqual({ ok: false, error: 'This inspection changed since you opened it' })
  })

  it('an inspector who is not assigned and finance are forbidden', async () => {
    const t = await target()
    for (const actor of [w.otherInspector, w.finance]) {
      state.actor = actor
      const r = await actions.recordResultAction(
        form({
          inspectionId: t.id,
          expectedRowVersion: String(t.rowVersion),
          result: 'passed',
          'item:rough-1': 'pass',
        }),
      )
      expect(r).toMatchObject({ ok: false, error: 'You do not have permission to do this.' })
    }
  })

  it('a public user is signed out of the staff action', async () => {
    const t = await target()
    state.actor = w.world.applicant
    const r = await actions.recordResultAction(
      form({
        inspectionId: t.id,
        expectedRowVersion: String(t.rowVersion),
        result: 'passed',
        'item:rough-1': 'pass',
      }),
    )
    expect(r).toEqual({ ok: false, error: 'Sign in to continue.' })
  })

  it('malformed input is refused before the database', async () => {
    const r = await actions.recordResultAction(
      form({ inspectionId: 'nope', expectedRowVersion: 'x', result: 'maybe' }),
    )
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: { inspectionId: 'Choose an inspection.', result: 'Choose a result.' },
    })
  })

  it('the photo intent action is forbidden for an inspector who is not assigned', async () => {
    const t = await target()
    state.actor = w.otherInspector
    const r = await actions.createPhotoUploadIntentAction(
      form({
        targetId: t.id,
        title: 'Panel',
        filename: 'p.jpg',
        contentType: 'image/jpeg',
        sizeBytes: '10',
      }),
    )
    expect(r).toEqual({ ok: false, error: 'You cannot add photos here.' })
    void RESULT_NOW
  })
})
