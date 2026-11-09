import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, auditLog, projectParties } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeUser } from '@/test/factories'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { withdrawApplicationAction, deleteDraftAction } = await import('./endingActions')

const h = actionHarness()
const signal = new AbortController().signal
let world: PermitWorld

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const NOT_ALLOWED = { ok: false as const, error: 'You do not have permission to do this.' }

async function app(state: 'draft' | 'submitted' | 'issued') {
  const made = await makeApplication(h.db, world, state === 'draft' ? {} : { state })
  const [row] = await h.db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, made.applicationId))
  return { applicationId: made.applicationId, expectedRowVersion: String(row?.rowVersion ?? 0) }
}

async function stateOf(applicationId: string): Promise<string | undefined> {
  const [row] = await h.db
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return row?.state
}

async function contractorOnProject(): Promise<Actor> {
  const id = await makeUser(h.db, { role: 'contractor' })
  await h.db.insert(projectParties).values({
    projectId: world.projectId,
    userId: id,
    name: 'Pat Contractor',
    role: 'contractor',
    addedBy: world.staff.userId,
  })
  return (await loadActor(h.db, id, signal)) as Actor
}

describe('withdrawApplicationAction', () => {
  it('lets the applicant withdraw a submitted application, and audits it', async () => {
    const input = await app('submitted')
    h.signIn(world.applicant)
    const result = await withdrawApplicationAction(h.form(input))
    expect(result).toEqual({ ok: true, message: 'Application withdrawn.' })
    expect(await stateOf(input.applicationId)).toBe('withdrawn')
    const audits = await h.db
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, input.applicationId),
          eq(auditLog.action, 'application.transition'),
        ),
      )
    expect(audits.map((a) => a.after)).toContainEqual({ state: 'withdrawn' })
  })

  it('refuses a contractor on the project and a stranger', async () => {
    const input = await app('submitted')
    h.signIn(await contractorOnProject())
    expect(await withdrawApplicationAction(h.form(input))).toEqual(NOT_ALLOWED)
    h.signIn(await h.actorFor('applicant'))
    expect(await withdrawApplicationAction(h.form(input))).toEqual(NOT_ALLOWED)
    expect(await stateOf(input.applicationId)).toBe('submitted')
  })

  it('refuses a draft and an issued permit', async () => {
    h.signIn(world.applicant)
    for (const state of ['draft', 'issued'] as const) {
      const input = await app(state)
      const result = await withdrawApplicationAction(h.form(input))
      expect(result.ok).toBe(false)
      expect(await stateOf(input.applicationId)).toBe(state)
    }
  })
})

describe('deleteDraftAction', () => {
  it('withdraws the applicant own draft through the same audited transition', async () => {
    const input = await app('draft')
    h.signIn(world.applicant)
    expect(await deleteDraftAction(h.form(input))).toEqual({ ok: true, message: 'Draft deleted.' })
    expect(await stateOf(input.applicationId)).toBe('withdrawn')
  })

  it('refuses a submitted application and a contractor', async () => {
    const submitted = await app('submitted')
    h.signIn(world.applicant)
    expect((await deleteDraftAction(h.form(submitted))).ok).toBe(false)
    expect(await stateOf(submitted.applicationId)).toBe('submitted')
    const draft = await app('draft')
    h.signIn(await contractorOnProject())
    expect(await deleteDraftAction(h.form(draft))).toEqual(NOT_ALLOWED)
    expect(await stateOf(draft.applicationId)).toBe('draft')
  })
})
