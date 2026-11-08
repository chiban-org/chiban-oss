import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { reportSchedules } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
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

const actions = await import('./actions')

let handle: TestDb
let staff: Actor
let inspector: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  inspector = await staffActor(handle.db, 'inspector')
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) {
    for (const one of Array.isArray(v) ? v : [v]) f.append(k, one)
  }
  return f
}

async function onlySchedule() {
  const rows = await handle.db.select().from(reportSchedules)
  expect(rows).toHaveLength(1)
  return rows[0]
}

describe('schedule actions', () => {
  it('creates a schedule', async () => {
    state.actor = staff
    expect(
      await actions.createScheduleAction(
        form({ report: 'revenue', frequency: 'monthly', recipientIds: [staff.userId] }),
      ),
    ).toEqual({ ok: true, message: 'Report scheduled.' })
    expect(await onlySchedule()).toMatchObject({ report: 'revenue', frequency: 'monthly' })
  })

  it('asks for a recipient when none is ticked', async () => {
    state.actor = staff
    const result = await actions.createScheduleAction(
      form({ report: 'revenue', frequency: 'monthly' }),
    )
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { recipientIds: 'Choose at least one person to send it to.' },
    })
  })

  it('refuses every schedule action from an inspector, who lacks the reports capability', async () => {
    state.actor = inspector
    const row = await onlySchedule()
    const id = row?.id ?? ''
    const create = await actions.createScheduleAction(
      form({ report: 'permit-volume', frequency: 'weekly', recipientIds: [staff.userId] }),
    )
    expect(create.ok).toBe(false)
    const update = await actions.updateScheduleAction(
      form({
        scheduleId: id,
        report: 'permit-volume',
        frequency: 'weekly',
        recipientIds: [staff.userId],
      }),
    )
    expect(update.ok).toBe(false)
    expect((await actions.pauseScheduleAction(form({ scheduleId: id }))).ok).toBe(false)
    expect((await actions.resumeScheduleAction(form({ scheduleId: id }))).ok).toBe(false)
    expect((await actions.deleteScheduleAction(form({ scheduleId: id }))).ok).toBe(false)
    expect(await onlySchedule()).toMatchObject({ report: 'revenue', paused: false })
  })

  it('pauses, resumes, edits and deletes for staff', async () => {
    state.actor = staff
    const id = (await onlySchedule())?.id ?? ''
    expect(await actions.pauseScheduleAction(form({ scheduleId: id }))).toMatchObject({ ok: true })
    expect((await onlySchedule())?.paused).toBe(true)
    expect(await actions.resumeScheduleAction(form({ scheduleId: id }))).toMatchObject({ ok: true })
    expect(
      await actions.updateScheduleAction(
        form({
          scheduleId: id,
          report: 'revenue',
          frequency: 'quarterly',
          recipientIds: [staff.userId],
        }),
      ),
    ).toEqual({ ok: true, message: 'Schedule saved.' })
    expect((await onlySchedule())?.frequency).toBe('quarterly')
    expect(await actions.deleteScheduleAction(form({ scheduleId: id }))).toMatchObject({ ok: true })
    const left = await handle.db.select().from(reportSchedules).where(eq(reportSchedules.id, id))
    expect(left).toEqual([])
  })
})
