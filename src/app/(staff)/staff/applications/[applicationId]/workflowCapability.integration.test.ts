import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Role } from '@/constants/roles'
import { applications } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody, saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

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

const { setSubstepAction, transitionAction } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/actions'
)

let handle: TestDb
let world: PermitWorld
const actors = new Map<Role, Actor>()

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  await saveAndPublish(
    handle.db,
    world.admin,
    'application_type',
    'BP',
    appTypeBody({
      workflow: {
        allowsDirectIssue: false,
        closesOn: 'certificate_of_occupancy',
        substeps: [{ state: 'under_review', key: 'plan_review', label: 'Plan review' }],
      },
    }),
  )
  for (const role of ['admin', 'staff', 'finance', 'inspector'] as const) {
    actors.set(role, await staffActor(handle.db, role))
  }
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

async function underReview(): Promise<{ applicationId: string; rowVersion: string }> {
  const { applicationId } = await makeApplication(handle.db, world, { state: 'under_review' })
  const [row] = await handle.db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return { applicationId, rowVersion: String(row?.rowVersion ?? 0) }
}

async function attempt(role: Role) {
  state.actor = actors.get(role)
  const step = await underReview()
  const setStep = await setSubstepAction(
    form({
      applicationId: step.applicationId,
      expectedRowVersion: step.rowVersion,
      substep: 'plan_review',
    }),
  )
  const app = await underReview()
  const withdraw = await transitionAction(
    form({ applicationId: app.applicationId, to: 'withdrawn', expectedRowVersion: app.rowVersion }),
  )
  return { setStep, withdraw }
}

describe('setting the workflow step and withdrawing', () => {
  it.each(['finance', 'inspector'] as const)('is refused to %s', async (role) => {
    const refused = { ok: false, error: 'You do not have permission to do this.' }
    expect(await attempt(role)).toEqual({ setStep: refused, withdraw: refused })
  })

  it.each(['staff', 'admin'] as const)('is open to %s', async (role) => {
    const result = await attempt(role)
    expect(result.setStep).toEqual({ ok: true, message: 'Step updated.' })
    expect(result.withdraw).toEqual({ ok: true, message: 'Moved to withdrawn.' })
  })
})
