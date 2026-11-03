import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { countSections, sectionOf } from '@/test/htmlSections'

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
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ApplicationPage } = await import(
  '@/app/(staff)/staff/applications/[applicationId]/page'
)

const signal = new AbortController().signal
let handle: TestDb
let ids = new Map<string, string>()
const pages = new Map<string, string>()

async function page(number: string): Promise<string> {
  const cached = pages.get(number)
  if (cached !== undefined) return cached
  const element = await ApplicationPage({
    params: Promise.resolve({ applicationId: ids.get(number) ?? '' }),
  })
  const html = renderToStaticMarkup(element as never)
  pages.set(number, html)
  return html
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  const staff = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, 'staff@alderpond.example'),
  })
  state.actor = await loadActor(handle.db, staff?.id ?? '', signal)
  const rows = await handle.db.select().from(applications)
  ids = new Map(rows.map((r) => [r.number, r.id]))
})
afterAll(async () => {
  await handle.drop()
})

describe('panels fit the application type and state', () => {
  it('shows Completeness only on a building permit that is waiting for it', async () => {
    expect(countSections(await page('EL-2026-0006'), 'Completeness')).toBe(0)
    expect(countSections(await page('VAR-2026-0003'), 'Completeness')).toBe(0)
    expect(countSections(await page('BP-2026-0004'), 'Completeness')).toBe(0)
  })

  it('a denied variance does not talk about exercising an approval', async () => {
    const html = await page('VAR-2026-0004')
    expect(html).not.toContain('exercise the approval')
    expect(html).not.toContain('The approval must be exercised')
  })

  it('a finished application offers no hearing to schedule and no review to route', async () => {
    const denied = await page('VAR-2026-0004')
    expect(denied).not.toContain('Schedule a hearing')
    expect(denied).not.toContain('Send to review departments')
    expect(await page('VAR-2026-0003')).toContain('Schedule a hearing')
  })

  it('the board panel summarises the scheduled hearings, not a missing acceptance meeting', async () => {
    const board = sectionOf(await page('VAR-2026-0003'), 'Board') ?? ''
    expect(board).not.toContain('No hearing meeting is set.')
  })

  it('a decided application drops the filing deadline reminder', async () => {
    expect(await page('SPR-2026-0002')).not.toContain('must be filed before the deadline')
  })

  it('appeals live in one panel that does not contradict itself', async () => {
    const suspended = await page('BP-2026-0003')
    expect(countSections(suspended, 'Appeals')).toBe(1)
    expect(suspended).not.toContain('No appeal has been filed')
    expect(suspended).toContain('Resolve appeal')
    for (const number of ['VAR-2026-0004', 'SPR-2026-0002']) {
      expect(countSections(await page(number), 'Appeals')).toBeLessThanOrEqual(1)
    }
  })

  it('offers building removal and inspection requests only on permits that have them', async () => {
    expect(await page('BP-2026-0004')).toContain('Record the building removed')
    expect(await page('VAR-2026-0003')).not.toContain('Record the building removed')
    expect(await page('VAR-2026-0003')).not.toContain('Take an inspection request')
    expect(await page('SPR-2026-0002')).not.toContain('Take an inspection request')
  })

  it('treats a review stage with nobody assigned as a filled Reviewers panel, not an empty row', async () => {
    const html = await page('BP-2026-0002')
    const reviewers = sectionOf(html, 'Reviewers') ?? ''
    expect(reviewers).toContain('No reviewer is assigned')
    const empty = html.slice(html.indexOf('data-empty-group'))
    expect(empty).not.toContain('aria-label="Reviewers"')
  })
})

describe('money is shown once', () => {
  it('merges fees and payments into one table with assessed, paid and due', async () => {
    const html = await page('BP-2026-0003')
    expect(countSections(html, 'Fees and payments')).toBe(1)
    expect(countSections(html, 'Payments')).toBe(0)
    expect(countSections(html, 'Fees')).toBe(0)
    const panel = sectionOf(html, 'Fees and payments') ?? ''
    for (const column of ['Fee', 'Assessed', 'Paid', 'Due']) {
      expect(panel).toContain(`>${column}</th>`)
    }
    expect(panel).toContain('How it was worked out')
    expect(panel.match(/Balance due/g)).toHaveLength(1)
    expect(panel).not.toContain('(assessment 1)')
    expect(panel).not.toMatch(/at_intake|at_approval/)
    expect(panel).toContain('Receipt ')
  })

  it('shows the preview of the next assessment, with its waiver, in the same table', async () => {
    const panel = sectionOf(await page('BP-2026-0001'), 'Fees and payments') ?? ''
    expect(panel).toContain('Waived (was $')
    expect(panel).toContain('Next assessment, not yet due')
    expect(panel.match(/<table/g)).toHaveLength(1)
  })

  it('the board notice costs keep the mailing count and drop the dollar lines', async () => {
    const costs = sectionOf(await page('SPR-2026-0002'), 'Notice costs') ?? ''
    expect(costs).toContain('mailing')
    expect(costs).not.toContain('$')
  })
})

describe('destructive actions look destructive', () => {
  it('removing a reviewer is a small action with a confirmation step', async () => {
    const reviewers = sectionOf(await page('SPR-2026-0001'), 'Reviewers') ?? ''
    expect(reviewers).toMatch(/<summary[^>]*>Remove<\/summary>/)
    expect(reviewers).toContain('data-variant="destructive"')
  })

  it('hides the fee override on a finished application with nothing due', async () => {
    expect(await page('BP-2026-0004')).not.toContain('Waive or set a fee')
  })
})

describe('quick wins', () => {
  it('drops the citation that repeats the gate label and empty gate groups', async () => {
    const gates = sectionOf(await page('BP-2026-0003'), 'Gates') ?? ''
    expect(gates).not.toContain('No gates apply to this step')
    expect(gates.match(/RSA 676:6/g)?.length ?? 0).toBeLessThanOrEqual(2)
    expect(gates).not.toMatch(/<p[^>]*>RSA 676:6<\/p>/)
  })

  it('offers a Not set step when the substep is empty instead of preselecting one', async () => {
    const rail = sectionOf(await page('SPR-2026-0002'), 'Next step') ?? ''
    if (rail.includes('name="substep"')) {
      expect(rail).toMatch(/<option value="">Not set<\/option>|value="" selected/)
    }
  })
})
