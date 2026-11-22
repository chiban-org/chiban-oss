import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { type Actor, loadActor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { seedParcelWorld } from '@/test/parcels'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: RecordsRequestPage } = await import('@/app/(public)/records/request/page')

const signal = new AbortController().signal
let handle: TestDb

async function actorWith(input: Parameters<typeof makeUser>[1]): Promise<Actor> {
  const actor = await loadActor(handle.db, await makeUser(handle.db, input), signal)
  if (actor === null) throw new Error('actor')
  return actor
}

async function emailValue(): Promise<string | null> {
  const markup = renderToStaticMarkup(await RecordsRequestPage())
  const input = /<input[^>]*name="email"[^>]*>/.exec(markup)?.[0] ?? ''
  return /value="([^"]*)"/.exec(input)?.[1] ?? null
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('the public records request page', () => {
  it('fills in the email of the signed-in resident from their account', async () => {
    state.actor = await actorWith({ role: 'applicant', email: 'wren.ashby@fernhollow.example' })
    expect(await emailValue()).toBe('wren.ashby@fernhollow.example')
  })

  it('leaves the email empty for a visitor and for a signed-in staff member', async () => {
    state.actor = null
    expect(await emailValue()).toBe('')
    state.actor = await actorWith({ role: 'staff', email: 'clerk@fernhollow.example' })
    expect(await emailValue()).toBe('')
  })
})
