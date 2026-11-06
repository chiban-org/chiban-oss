import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applicationNotes } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

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

const { addApplicationNoteAction } = await import('./notesActions')

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

async function notesOn(applicationId: string) {
  return await handle.db
    .select({ body: applicationNotes.body, authorId: applicationNotes.authorId })
    .from(applicationNotes)
    .where(eq(applicationNotes.applicationId, applicationId))
}

describe('addApplicationNoteAction', () => {
  it('saves a clerk note on the application under the clerk', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    state.actor = world.staff
    const result = await addApplicationNoteAction(
      form({ applicationId, body: 'Owner will bring the septic design Friday.' }),
    )
    expect(result).toEqual({ ok: true, message: 'Note added.' })
    expect(await notesOn(applicationId)).toEqual([
      { body: 'Owner will bring the septic design Friday.', authorId: world.staff.userId },
    ])
  })

  it('refuses an inspector and a reviewer, who lack application.manage, and saves nothing', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    for (const actor of [await staffActor(handle.db, 'inspector'), world.reviewer]) {
      state.actor = actor
      const result = await addApplicationNoteAction(form({ applicationId, body: 'Not allowed.' }))
      expect(result).toEqual({ ok: false, error: 'You do not have permission to do this.' })
    }
    expect(await notesOn(applicationId)).toEqual([])
  })

  it('refuses a portal user outright', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    state.actor = world.applicant
    const result = await addApplicationNoteAction(form({ applicationId, body: 'From the portal.' }))
    expect(result.ok).toBe(false)
    expect(await notesOn(applicationId)).toEqual([])
  })
})
