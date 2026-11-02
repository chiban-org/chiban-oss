import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

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

const { transitionAction } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/actions'
)

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
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

describe('board application decisions', () => {
  it('a board application is decided only by recording the board decision, not by a bare move', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
    state.actor = world.staff
    for (const to of ['decided', 'denied']) {
      const result = await transitionAction(
        form({ applicationId: app.applicationId, to, expectedRowVersion: '1' }),
      )
      expect(result).toEqual({
        ok: false,
        error: 'Record the board decision from its hearing; that sets the outcome and the state.',
      })
    }
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, app.applicationId))
    expect(row?.state).toBe('under_review')
    const view = await getStaffApplicationView(
      handle.db,
      world.staff,
      app.applicationId,
      new Date(),
      signal,
    )
    expect(view?.nextTransitions).not.toContain('decided')
    expect(view?.nextTransitions).not.toContain('denied')
  })
})
