import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { backupSchedule, exportTargets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
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

const actions = await import('./actions')

let handle: TestDb
let admin: Actor
let reviewer: Actor
let targetId: string

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  reviewer = await staffActor(handle.db, 'reviewer')
  const [target] = await handle.db
    .insert(exportTargets)
    .values({ kind: 'local_fs', name: 'Town server', settings: { root: '/srv/backups' } })
    .returning({ id: exportTargets.id })
  targetId = target?.id ?? ''
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  state.actor = admin
})

const SCHEDULE = { frequency: 'weekly', startHour: '2', keepCount: '8' }

describe('backup actions', () => {
  it('asks for a schedule before a backup can be requested', async () => {
    expect(await actions.backUpNowAction(form({}))).toEqual({
      ok: false,
      error: 'Choose where backups go and save the schedule first.',
    })
  })

  it('an admin saves a schedule and asks for a backup now', async () => {
    const saved = await actions.saveBackupScheduleAction(form({ ...SCHEDULE, targetId }))
    expect(saved).toEqual({ ok: true, message: 'Saved.' })
    const [row] = await handle.db.select().from(backupSchedule)
    expect(row).toMatchObject({ targetId, frequency: 'weekly', startHour: 2, keepCount: 8 })
    expect(await actions.backUpNowAction(form({}))).toEqual({
      ok: true,
      message: 'Requested. The backup starts within a minute or two.',
    })
    const [asked] = await handle.db.select().from(backupSchedule)
    expect(asked?.runRequestedAt).not.toBeNull()
  })

  it('refuses out of range values field by field', async () => {
    const result = await actions.saveBackupScheduleAction(
      form({ targetId, frequency: 'hourly', startHour: '24', keepCount: '0' }),
    )
    expect(result.ok).toBe(false)
    const fields = result.ok ? {} : (result.fieldErrors ?? {})
    expect(Object.keys(fields).sort()).toEqual(['frequency', 'keepCount', 'startHour'])
  })

  it('refuses a storage that does not exist on its field', async () => {
    const result = await actions.saveBackupScheduleAction(
      form({ ...SCHEDULE, targetId: '00000000-0000-4000-8000-00000000abcd' }),
    )
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { targetId: 'That storage no longer exists. Choose another one.' },
    })
  })

  it('an empty storage choice turns scheduled backups off', async () => {
    expect(await actions.saveBackupScheduleAction(form({ ...SCHEDULE, targetId: '' }))).toEqual({
      ok: true,
      message: 'Saved. Scheduled backups are off.',
    })
    const [row] = await handle.db.select().from(backupSchedule)
    expect(row).toMatchObject({ targetId: null, nextDueAt: null, runRequestedAt: null })
  })

  it('staff without config.edit cannot change the schedule', async () => {
    state.actor = reviewer
    const result = await actions.saveBackupScheduleAction(form({ ...SCHEDULE, targetId }))
    expect(result.ok).toBe(false)
    const [row] = await handle.db.select().from(backupSchedule)
    expect(row?.targetId).toBeNull()
  })
})
