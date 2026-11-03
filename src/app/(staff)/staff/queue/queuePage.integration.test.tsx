import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
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
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const { default: QueuePage } = await import('./page')

let handle: TestDb
let world: PermitWorld
let deniedNumber = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  for (let i = 0; i < 26; i += 1) {
    await makeApplication(handle.db, world, { state: 'submitted' })
  }
  deniedNumber = (await makeApplication(handle.db, world, { state: 'denied' })).number
  state.actor = world.staff
})
afterAll(async () => {
  await handle.drop()
})

const render = async (params: Record<string, string>) =>
  renderToStaticMarkup(await QueuePage({ searchParams: Promise.resolve(params) }))

describe('/staff/queue page', () => {
  it('opens on applications that need action and leaves finished ones to all but draft', async () => {
    const html = await render({})
    expect(html).toMatch(/<option value="" selected="">Needs action<\/option>/)
    expect(html).toContain('26 applications')
    expect(await render({ q: deniedNumber })).not.toContain(`>${deniedNumber}<`)
    expect(await render({ state: 'all' })).toContain('27 applications')
    expect(await render({ state: 'all', q: deniedNumber })).toContain(`>${deniedNumber}<`)
  })

  it('pages with a range, a previous link, and a next link that keep the filters', async () => {
    const first = await render({})
    expect(first).toContain('1-25 of 26')
    expect(first).toContain('href="/staff/queue?cursor=25"')
    expect(first).not.toContain('Previous page')
    const second = await render({ cursor: '25' })
    expect(second).toContain('26-26 of 26')
    expect(second).toContain('Previous page')
    expect(second).toContain('href="/staff/queue"')
    expect(second).not.toContain('Next page')
    const filtered = await render({ state: 'all' })
    expect(filtered).toContain('href="/staff/queue?state=all&amp;cursor=25"')
  })

  it('names the active filters next to the count with a way to clear them', async () => {
    expect(await render({})).not.toContain('Clear filters')
    const html = await render({ state: 'all', mine: '1' })
    expect(html).toContain('All but draft')
    expect(html).toContain('Assigned to me')
    expect(html).toMatch(/<a[^>]*href="\/staff\/queue"[^>]*>Clear filters<\/a>/)
  })

  it('says what matched nothing inside the panel, with a way back', async () => {
    const html = await render({ q: 'ZZZ-NONE' })
    expect(html).toContain('No applications match Number contains ZZZ-NONE.')
    expect(html).toMatch(/class="table-panel".*No applications match/)
  })

  it('shows the keys as their own line and submits filters without an apply button', async () => {
    const html = await render({})
    expect(html).toContain('<kbd')
    expect(html).not.toContain('Apply filters')
  })
})
