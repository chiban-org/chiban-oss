import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parcels } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

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
  it('shows a clerk what needs attention with links into the application list', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await StaffHome())
    expect(html).toContain('>Applications</h2>')
    expect(html).toContain('Submitted and not yet started')
    expect(html).toContain('href="/staff/applications?state=submitted"')
    expect(html).toContain('href="/staff/applications"')
    expect(html).not.toContain('Open in applications')
    expect(html.toLowerCase()).not.toContain('queue')
    expect(html).toContain('Find a parcel')
  })

  it('counts the submitted application as not yet started', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await StaffHome())
    expect(html).toMatch(
      /<a[^>]*href="\/staff\/applications\?state=submitted"[^>]*><span[^>]*>1<\/span><span[^>]*>Submitted and not yet started<\/span><\/a>/,
    )
  })

  it('leaves out rows with nothing in them', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await StaffHome())
    expect(html).not.toContain('Past a deadline')
    expect(html).not.toMatch(/>0<\/span>/)
  })

  it('says nothing is waiting when every count is zero', async () => {
    const empty = await makeTestDb()
    state.db = empty.db
    try {
      await seedParcelWorld(empty.db)
      state.actor = await staffActor(empty.db, 'staff')
      const html = renderToStaticMarkup(await StaffHome())
      expect(html).toContain('Nothing waiting.')
      expect(html).not.toContain('Submitted and not yet started')
    } finally {
      state.db = handle.db
      await empty.drop()
    }
  })

  it('sends a reviewer to their reviews', async () => {
    state.actor = await staffActor(handle.db, 'reviewer')
    await expect(StaffHome()).rejects.toThrow('NEXT_REDIRECT:/staff/reviews')
  })

  it('offers recent searches and an example under the parcel search', async () => {
    await handle.db.insert(parcels).values({ siteAddress: '12 Heron Cove' })
    state.actor = world.staff
    const html = renderToStaticMarkup(await StaffHome())
    expect(html).toMatch(/Try<\/span><a href="\/staff\/parcels\?q=/)
  })

  it('sends a board member to the board page', async () => {
    state.actor = await staffActor(handle.db, 'board_member')
    await expect(StaffHome()).rejects.toThrow('NEXT_REDIRECT:/board')
  })

  it('keeps staff who are also inspectors on the home page', async () => {
    const actor = await staffActor(handle.db, 'staff')
    state.actor = { ...actor, roles: ['inspector', 'staff'] }
    const html = renderToStaticMarkup(await StaffHome())
    expect(html).toContain('>Applications</h2>')
  })
})
