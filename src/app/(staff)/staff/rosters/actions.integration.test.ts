import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

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
let world: BoardWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
  state.actor = world.staff
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

describe('easement and restriction holders', () => {
  it('an unknown parcel ID is named as the problem', async () => {
    const result = await actions.addRestrictionAction(
      form({
        parcelRef: '999999999999',
        holderName: 'Alder Pond Land Trust',
        holderMailingAddress: '1 Trust Way, Alder Pond NH 03999',
        restrictionKind: 'conservation',
        recordedReference: 'Book 1 Page 2',
      }),
    )
    expect(result).toEqual({
      ok: false,
      error: 'No parcel has the ID 999999999999. Check the parcel ID and try again.',
    })
  })
})
