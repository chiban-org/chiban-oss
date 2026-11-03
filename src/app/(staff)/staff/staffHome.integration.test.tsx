import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
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
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: StaffHome } = await import('./page')

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  await submittedTrade(handle.db, world)
})
afterAll(async () => {
  await handle.drop()
})

describe('/staff home', () => {
  it('shows a clerk what needs attention with links into the queue', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await StaffHome())
    expect(html).toContain('Needs attention')
    expect(html).toContain('Submitted and not yet started')
    expect(html).toContain('href="/staff/queue?state=submitted"')
    expect(html).toContain('Find a parcel')
  })

  it('counts the submitted application as not yet started', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await StaffHome())
    expect(html).toMatch(/>1<\/span><span[^>]*>Submitted and not yet started</)
  })

  it('keeps staff who are also inspectors on the home page', async () => {
    const actor = await staffActor(handle.db, 'staff')
    state.actor = { ...actor, roles: ['inspector', 'staff'] }
    const html = renderToStaticMarkup(await StaffHome())
    expect(html).toContain('Needs attention')
  })
})
