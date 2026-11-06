import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { enforcementCases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { openCase } from '@/features/enforcement/cases'
import { makeTestDb, type TestDb } from '@/test/db'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'

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

const { reassignCaseAction } = await import('./assignActions')

const signal = new AbortController().signal
let handle: TestDb
let world: EnforcementWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupEnforcementWorld(handle.db)
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

async function newCase(): Promise<string> {
  const opened = await openCase(handle.db, world.staff, { locationText: '3 Loon Lane' }, signal)
  if (!opened.ok) throw new Error('open failed')
  return opened.value.caseId
}

async function assignedTo(caseId: string) {
  const [row] = await handle.db
    .select({ id: enforcementCases.assignedTo })
    .from(enforcementCases)
    .where(eq(enforcementCases.id, caseId))
  return row?.id ?? null
}

describe('reassignCaseAction', () => {
  it('lets staff hand a case to an inspector', async () => {
    const caseId = await newCase()
    state.actor = world.staff
    const result = await reassignCaseAction(form({ caseId, userId: world.inspector.userId }))
    expect(result).toEqual({ ok: true, message: 'Case reassigned.' })
    expect(await assignedTo(caseId)).toBe(world.inspector.userId)
  })

  it('refuses finance, who lacks enforcement.manage, and leaves the case alone', async () => {
    const caseId = await newCase()
    state.actor = world.finance
    const result = await reassignCaseAction(form({ caseId, userId: world.inspector.userId }))
    expect(result.ok).toBe(false)
    expect(await assignedTo(caseId)).toBe(world.staff.userId)
  })

  it('says why someone outside enforcement cannot take the case', async () => {
    const caseId = await newCase()
    state.actor = world.staff
    const result = await reassignCaseAction(form({ caseId, userId: world.finance.userId }))
    expect(result).toEqual({
      ok: false,
      error: 'Choose someone whose role works code enforcement cases.',
    })
  })
})
