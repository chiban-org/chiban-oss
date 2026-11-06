import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { refuseField } from '@/server/formInput'
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

const { setResponsibleStaffAction } = await import('./responsibleActions')

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

async function responsible(applicationId: string) {
  const [row] = await handle.db
    .select({ id: applications.responsibleUserId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.id ?? null
}

describe('setResponsibleStaffAction', () => {
  it('lets a clerk take an application and then hand it back to nobody', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    state.actor = world.staff
    const taken = await setResponsibleStaffAction(
      form({ applicationId, userId: world.staff.userId }),
    )
    expect(taken).toEqual({ ok: true, message: 'Responsible staff member saved.' })
    expect(await responsible(applicationId)).toBe(world.staff.userId)
    const cleared = await setResponsibleStaffAction(form({ applicationId, userId: '' }))
    expect(cleared.ok).toBe(true)
    expect(await responsible(applicationId)).toBeNull()
  })

  it('refuses an inspector, who lacks application.manage, and leaves the record alone', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    const inspector = await staffActor(handle.db, 'inspector')
    state.actor = inspector
    const result = await setResponsibleStaffAction(
      form({ applicationId, userId: inspector.userId }),
    )
    expect(result.ok).toBe(false)
    expect(await responsible(applicationId)).toBeNull()
  })

  it('says why a reviewer cannot be the responsible staff member', async () => {
    const { applicationId } = await makeApplication(handle.db, world, { state: 'submitted' })
    state.actor = world.staff
    const result = await setResponsibleStaffAction(
      form({ applicationId, userId: world.reviewer.userId }),
    )
    expect(result).toEqual(
      refuseField(
        'userId',
        'Choose an active town staff member. Reviewers and applicants cannot be responsible.',
      ),
    )
  })
})
