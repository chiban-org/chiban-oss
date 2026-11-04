import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { trcRoutings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { assignReviewer, signOffReview } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const state = vi.hoisted((): { db: unknown; actor: Actor | null } => ({ db: null, actor: null }))

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

const { default: ReviewsPage } = await import('./page')

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
const numbers = new Map<string, string>()
const assignments = new Map<string, string>()

async function assigned(name: string, commentDue: string | null): Promise<void> {
  const app = await makeApplication(handle.db, world, { state: 'submitted' })
  const made = await assignReviewer(
    handle.db,
    world.staff,
    { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
    signal,
  )
  if (!made.ok) throw new Error('assign')
  numbers.set(name, app.number)
  assignments.set(name, made.value.assignmentId)
  if (commentDue !== null) {
    await handle.db.insert(trcRoutings).values({
      applicationId: app.applicationId,
      departmentKey: 'fire',
      assignmentId: made.value.assignmentId,
      commentDue,
    })
  }
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  await assigned('late', '2027-04-20')
  await assigned('soon', '2027-03-15')
  await assigned('undated', null)
  await assigned('done', '2027-03-01')
  await signOffReview(
    handle.db,
    world.reviewer,
    { assignmentId: assignments.get('done') ?? '' },
    signal,
  )
  const other = await staffActor(handle.db, 'reviewer')
  const stranger = await makeApplication(handle.db, world, { state: 'submitted' })
  await assignReviewer(
    handle.db,
    world.staff,
    { applicationId: stranger.applicationId, reviewerUserId: other.userId },
    signal,
  )
  numbers.set('stranger', stranger.number)
  const finished = await makeApplication(handle.db, world, { state: 'closed' })
  await assignReviewer(
    handle.db,
    world.staff,
    { applicationId: finished.applicationId, reviewerUserId: world.reviewer.userId },
    signal,
  )
  numbers.set('finished', finished.number)
  state.actor = world.reviewer
})
afterAll(async () => {
  await handle.drop()
})

const render = async (params: Record<string, string>) =>
  renderToStaticMarkup(await ReviewsPage({ searchParams: Promise.resolve(params) }))

function order(html: string, names: string[]): string[] {
  return names
    .map((name) => ({ name, at: html.indexOf(`>${numbers.get(name)}<`) }))
    .filter((n) => n.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((n) => n.name)
}

const tab = (html: string, label: string) => {
  const end = html.indexOf(`>${label}<`)
  return end < 0 ? '' : html.slice(html.lastIndexOf('<a ', end), html.indexOf('</a>', end))
}

describe('/staff/reviews for a reviewer', () => {
  it('lists open reviews in a table, comments due soonest first, linked to each review', async () => {
    const html = await render({})
    expect(html).toContain('data-wide=""')
    expect(html).toContain('class="table-panel"')
    const head = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'))
    for (const header of ['Application', 'Project', 'Status', 'Comments due']) {
      expect(head).toContain(`${header}<`)
    }
    expect(order(html, ['late', 'soon', 'undated', 'done', 'stranger', 'finished'])).toEqual([
      'soon',
      'late',
      'undated',
    ])
    expect(html).toContain(`href="/staff/reviews/${assignments.get('soon')}"`)
    expect(html).toContain('Garage addition')
    expect(html).toContain('Mar 15, 2027')
    expect(html).toContain('Pending')
  })

  it('counts open and signed-off reviews in tabs and lists signed-off ones on their own tab', async () => {
    const html = await render({})
    expect(tab(html, 'Open')).toContain('aria-current="page"')
    expect(tab(html, 'Open')).toContain('>3</span>')
    expect(tab(html, 'Signed off')).toContain('>1</span>')
    expect(tab(html, 'Signed off')).toContain('href="/staff/reviews?tab=signed_off"')
    expect(tab(html, 'Closed')).toContain('>1</span>')
    const signed = await render({ tab: 'signed_off' })
    expect(order(signed, ['late', 'soon', 'undated', 'done', 'finished'])).toEqual(['done'])
    const closed = await render({ tab: 'closed' })
    expect(order(closed, ['late', 'soon', 'undated', 'done', 'finished'])).toEqual(['finished'])
  })

  it('sorts from the column headers', async () => {
    const html = await render({})
    expect(html).toMatch(/href="\/staff\/reviews\?sort=number[^"]*"/)
    const byNumber = await render({ sort: 'number', dir: 'desc' })
    expect(order(byNumber, ['late', 'soon', 'undated'])).toEqual(['undated', 'soon', 'late'])
  })

  it('tells a reviewer with nothing open that nothing is waiting', async () => {
    state.actor = await staffActor(handle.db, 'reviewer')
    try {
      expect(await render({})).toContain('No reviews are waiting on you.')
    } finally {
      state.actor = world.reviewer
    }
  })
})
