import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parcels } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld } from '@/test/ledgerFixtures'

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
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('./actions', () => ({
  checkAction: vi.fn(),
  completeAction: vi.fn(),
  quickIssueAction: vi.fn(),
  readerAction: vi.fn(),
  reconnectAction: vi.fn(),
  sendClaimAction: vi.fn(),
}))

const { default: CounterPage } = await import('./page')

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  state.actor = world.staff
})
afterAll(async () => {
  await handle.drop()
})

describe('counter parcel search', () => {
  it('shows the shared key hints', async () => {
    const html = renderToStaticMarkup(await CounterPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('data-slot="key-hints"')
    expect(html).toContain('search for a parcel')
  })

  it('says so when nothing matches', async () => {
    const html = renderToStaticMarkup(
      await CounterPage({ searchParams: Promise.resolve({ q: 'zzzzzz nothing' }) }),
    )
    expect(html).toContain('No parcels match')
  })

  it('says nothing about matches before a search is made', async () => {
    const html = renderToStaticMarkup(await CounterPage({ searchParams: Promise.resolve({}) }))
    expect(html).not.toContain('No parcels match')
  })

  it('asks for two characters when the search is too short', async () => {
    const html = renderToStaticMarkup(
      await CounterPage({ searchParams: Promise.resolve({ q: 'a' }) }),
    )
    expect(html).toContain('Enter at least two characters')
  })

  it('shows the site address next to the selected parcel ID', async () => {
    await handle.db
      .update(parcels)
      .set({ siteAddress: '12 Elm Road' })
      .where(eq(parcels.id, world.parcelId))
    const html = renderToStaticMarkup(
      await CounterPage({ searchParams: Promise.resolve({ parcel: world.parcelId }) }),
    )
    expect(html).toContain('12 Elm Road')
  })

  it('offers a one-click example search that stays on the counter', async () => {
    await handle.db
      .update(parcels)
      .set({ siteAddress: '12 Elm Road' })
      .where(eq(parcels.id, world.parcelId))
    const html = renderToStaticMarkup(await CounterPage({ searchParams: Promise.resolve({}) }))
    expect(html).toMatch(/Try<\/span><a href="\/staff\/counter\?q=12%20Elm%20Road"/)
  })

  it('says a hit has no site address instead of leaving a bare ID', async () => {
    const [other] = await handle.db
      .insert(parcels)
      .values({ siteAddress: null, ownerName: 'Zed Nameless' })
      .returning({ id: parcels.id })
    const html = renderToStaticMarkup(
      await CounterPage({ searchParams: Promise.resolve({ q: 'Nameless' }) }),
    )
    expect(other).toBeDefined()
    expect(html).toContain('No site address')
  })
})
