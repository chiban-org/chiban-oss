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
  permanentRedirect: (url: string) => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${url}`)
  },
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const { default: ApplicationsPage } = await import('./page')
const { default: QueueRedirect } = await import('../queue/page')

let handle: TestDb
let world: PermitWorld
let deniedNumber = ''
let draftNumber = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  for (let i = 0; i < 26; i += 1) {
    await makeApplication(handle.db, world, { state: 'submitted' })
  }
  deniedNumber = (await makeApplication(handle.db, world, { state: 'denied' })).number
  draftNumber = (await makeApplication(handle.db, world, { state: 'draft' })).number
  state.actor = world.staff
})
afterAll(async () => {
  await handle.drop()
})

const render = async (params: Record<string, string | string[]>) =>
  renderToStaticMarkup(await ApplicationsPage({ searchParams: Promise.resolve(params) }))

const tab = (html: string, label: string) => {
  const end = html.indexOf(`>${label}<`)
  return end < 0 ? '' : html.slice(html.lastIndexOf('<a ', end), html.indexOf('</a>', end))
}

describe('/staff/applications page', () => {
  it('opens on needs action under one Applications heading, without work queue wording', async () => {
    const html = await render({})
    expect(html).toContain('<h1>Applications</h1>')
    expect(html.toLowerCase()).not.toContain('queue')
    expect(html).not.toContain('<select')
    expect(tab(html, 'Needs action')).toContain('aria-current="page"')
    expect(tab(html, 'Needs action')).toContain('href="/staff/applications"')
    expect(html).toContain('26 applications')
    expect(await render({ q: deniedNumber })).not.toContain(`>${deniedNumber}<`)
    expect(html).not.toContain(`>${draftNumber}<`)
  })

  it('counts every tab and keeps drafts in open and all only', async () => {
    const html = await render({})
    expect(tab(html, 'Needs action')).toContain('>26</span>')
    expect(tab(html, 'Open')).toContain('>27</span>')
    expect(tab(html, 'Open')).toContain('href="/staff/applications?stage=open"')
    expect(tab(html, 'Issued or suspended')).toContain('>0</span>')
    expect(tab(html, 'Closed, denied, withdrawn or expired')).toContain('>1</span>')
    expect(tab(html, 'All')).toContain('>28</span>')
    expect(tab(html, 'All')).toContain('href="/staff/applications?stage=all"')
    expect(await render({ stage: 'open', q: draftNumber })).toContain(`>${draftNumber}<`)
    expect(await render({ stage: 'all', q: draftNumber })).toContain(`>${draftNumber}<`)
    const finished = await render({ stage: 'finished' })
    expect(finished).toContain(`>${deniedNumber}<`)
    expect(finished).not.toContain(`>${draftNumber}<`)
    expect(finished).toContain('1 application<')
    expect(await render({ stage: 'issued' })).toContain('No issued or suspended permits.')
  })

  it('pages with a range, a previous link, and a next link that keep the tab', async () => {
    const first = await render({})
    expect(first).toContain('1-25 of 26')
    expect(first).toContain('href="/staff/applications?cursor=25"')
    expect(first).not.toContain('Previous page')
    const second = await render({ cursor: '25' })
    expect(second).toContain('26-26 of 26')
    expect(second).toContain('Previous page')
    expect(second).not.toContain('Next page')
    expect(await render({ stage: 'all' })).toContain(
      'href="/staff/applications?stage=all&amp;cursor=25"',
    )
  })

  it('names the active filters next to the count and clears them without leaving the tab', async () => {
    expect(await render({ stage: 'all' })).not.toContain('Clear all')
    const html = await render({ stage: 'all', type: 'BP', sort: 'number' })
    expect(html).toContain('· Building permit')
    expect(html).toMatch(
      /<a[^>]*href="\/staff\/applications\?stage=all&amp;sort=number"[^>]*>Clear all<\/a>/,
    )
    expect(html.match(/>Clear all</g)).toHaveLength(1)
  })

  it('says what matched nothing inside the panel, with a way back to the same tab', async () => {
    const html = await render({ stage: 'open', q: 'ZZZ-NONE' })
    expect(html).toContain('No applications match Number contains ZZZ-NONE.')
    expect(html).toMatch(/class="table-panel".*No applications match/)
    expect(html).toMatch(/<a[^>]*href="\/staff\/applications\?stage=open"[^>]*>Clear filters</)
  })

  it('shows the keys as their own line and submits filters without an apply button', async () => {
    const html = await render({})
    expect(html).toContain('<kbd')
    expect(html).not.toContain('Apply filters')
  })

  it('links chips that reset paging, keep the sort and the tab, and carry the tab on search', async () => {
    const html = await render({ cursor: '25', sort: 'number', due: 'overdue', stage: 'open' })
    const chip = (label: string) => {
      const end = html.indexOf(`>${label}<`)
      return end < 0 ? '' : html.slice(html.lastIndexOf('<a ', end), end)
    }
    expect(html).not.toContain('type="checkbox"')
    expect(chip('Overdue')).toContain('aria-current="true"')
    expect(chip('Overdue')).toContain('href="/staff/applications?sort=number&amp;stage=open"')
    expect(chip('Due this week')).toContain(
      'href="/staff/applications?sort=number&amp;due=overdue&amp;due=week&amp;stage=open"',
    )
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*>Flags</)
    expect(html).toContain('<input type="hidden" name="stage" value="open"/>')
    expect(html).toContain('<input type="hidden" name="due" value="overdue"/>')
    expect(html).toContain('<input type="hidden" name="sort" value="number"/>')
    expect(html).not.toContain('name="cursor"')
  })

  it('sorts from every column header, due first, and keeps the sort while paging', async () => {
    const byDue = await render({})
    expect(byDue).toMatch(
      /<th scope="col" aria-sort="ascending"[^>]*><a[^>]*href="\/staff\/applications\?sort=due&amp;dir=desc"/,
    )
    for (const key of ['number', 'project', 'parcel', 'status', 'fees', 'reviewers', 'received']) {
      expect(byDue).toContain(`href="/staff/applications?sort=${key}&amp;dir=`)
    }
    const byNumber = await render({ sort: 'number', dir: 'desc' })
    expect(byNumber).toMatch(
      /aria-sort="descending"[^>]*><a[^>]*href="\/staff\/applications\?sort=number&amp;dir=asc"/,
    )
    expect(byNumber).toContain('href="/staff/applications?sort=number&amp;dir=desc&amp;cursor=25"')
    const numbers = [...byNumber.matchAll(/>([A-Z]+-\d{4}-\d{4})</g)].map((m) => m[1])
    expect(numbers).toEqual([...numbers].sort().reverse())
  })

  it('sends an old queue address to the matching tab with a permanent redirect', async () => {
    await expect(
      QueueRedirect({ searchParams: Promise.resolve({ state: 'denied', due: 'overdue' }) }),
    ).rejects.toThrow(
      'NEXT_PERMANENT_REDIRECT:/staff/applications?stage=finished&state=denied&due=overdue',
    )
    await expect(QueueRedirect({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_PERMANENT_REDIRECT:/staff/applications',
    )
  })
})
