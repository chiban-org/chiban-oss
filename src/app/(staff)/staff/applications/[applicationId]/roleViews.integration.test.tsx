import { and, eq, isNotNull, min } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, inspections, reviewAssignments, trcRoutings, users } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'
import { countSections, filledButtons, sectionOf } from '@/test/htmlSections'

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
const actors = new Map<string, Actor>()
const pages = new Map<string, string>()

async function actorFor(local: string): Promise<Actor> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  if (actor === null) throw new Error(`no ${local}`)
  return actor
}

async function pageAs(role: string, number: string): Promise<string> {
  const key = `${role} ${number}`
  const cached = pages.get(key)
  if (cached !== undefined) return cached
  state.actor = actors.get(role)
  const html = renderToStaticMarkup(
    (await ApplicationPage({
      params: Promise.resolve({ applicationId: ids.get(number) ?? '' }),
    })) as never,
  )
  pages.set(key, html)
  return html
}

function statusSentence(html: string): string {
  const match = html.match(/data-slot="status-sentence"[^>]*>([^<]*)</)
  return match?.[1]?.replaceAll('&#x27;', "'") ?? ''
}

async function commentDueFor(number: string): Promise<string | null> {
  const [row] = await handle.db
    .select({ due: min(trcRoutings.commentDue) })
    .from(trcRoutings)
    .innerJoin(reviewAssignments, eq(reviewAssignments.id, trcRoutings.assignmentId))
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .innerJoin(users, eq(users.id, reviewAssignments.reviewerUserId))
    .where(and(eq(applications.number, number), eq(users.displayName, 'Remy Reviewer')))
  return row?.due ?? null
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, await demoSeedDeps())
  for (const role of ['admin', 'staff', 'inspector', 'reviewer']) {
    actors.set(role, await actorFor(role))
  }
  const rows = await handle.db.select().from(applications)
  ids = new Map(rows.map((r) => [r.number, r.id]))
})
afterAll(async () => {
  await handle.drop()
})

describe('the inspector view of an issued permit', () => {
  it('leads with the inspector waiting on the reinspection, from the record', async () => {
    const [reinspection] = await handle.db
      .select({ date: inspections.scheduledDate })
      .from(inspections)
      .where(
        and(
          eq(inspections.applicationId, ids.get('BP-2025-0001') ?? ''),
          eq(inspections.status, 'scheduled'),
          isNotNull(inspections.reinspectionOf),
        ),
      )
    const today = await townToday(handle.db, new Date(), signal)
    const date = reinspection?.date ?? ''
    expect(date < today).toBe(true)
    expect(statusSentence(await pageAs('inspector', 'BP-2025-0001'))).toBe(
      `Waiting on: Inspector (you). Framing reinspection from ${formatCivilDate(date)} needs its result.`,
    )
  })

  it('puts the reinspection on top with Record result as the one filled button', async () => {
    const html = await pageAs('inspector', 'BP-2025-0001')
    const next = sectionOf(html, 'Next inspection') ?? ''
    expect(next).toContain('Framing reinspection')
    expect(next).toContain('Last time: failed on')
    expect(next).toContain('Notes for the permit holder')
    expect(filledButtons(html)).toEqual(['Record result'])
    expect(html.indexOf('aria-label="Next inspection"')).toBeLessThan(
      html.indexOf('aria-label="Last result"'),
    )
  })

  it('shows the last result with its notes and photo, then the open requests', async () => {
    const html = await pageAs('inspector', 'BP-2025-0001')
    const last = sectionOf(html, 'Last result') ?? ''
    expect(last).toContain('Fire blocking is missing at the stair opening.')
    expect(last).toContain('href="/api/documents/')
    const open = sectionOf(html, 'Open requests') ?? ''
    expect(open).toContain('Insulation inspection')
    expect(open).not.toContain('Framing reinspection')
    expect(countSections(html, 'Conditions')).toBe(1)
  })

  it('drops office work and keeps the print links folded under Permit facts', async () => {
    const html = await pageAs('inspector', 'BP-2025-0001')
    for (const label of [
      'Do this now',
      'Requirements',
      'Fees and payments',
      'Reviewers',
      'Clocks',
      'Code edition',
      'Regional impact',
      'Inspections',
    ]) {
      expect(countSections(html, label)).toBe(0)
    }
    expect(html).not.toContain('Issue the certificate of occupancy')
    expect(html).not.toContain('Assign a reviewer')
    const facts = html.slice(html.indexOf('<summary>Permit facts</summary>'))
    expect(html).toMatch(/<details data-permit-facts=""/)
    expect(facts).toContain('Print permit')
    expect(facts).toContain('Print placard')
    expect(facts).toContain('aria-label="Key facts"')
  })
})

describe('the clerk and the administrator keep the office page', () => {
  it('still shows the fees, the requirements and the inspections panel', async () => {
    for (const role of ['staff', 'admin']) {
      const html = await pageAs(role, 'BP-2025-0001')
      expect(countSections(html, 'Fees and payments')).toBe(1)
      expect(countSections(html, 'Inspections')).toBe(1)
      expect(sectionOf(html, 'Requirements') ?? '').toContain('Before it can be closed')
      expect(countSections(html, 'Next inspection')).toBe(0)
      expect(html).not.toContain('data-permit-facts')
    }
  })
})

describe('the reviewer view of an application under review', () => {
  it('makes Open your review the filled action and gives the comment date', async () => {
    const html = await pageAs('reviewer', 'SPR-2026-0001')
    const due = await commentDueFor('SPR-2026-0001')
    expect(due).not.toBeNull()
    const card = sectionOf(html, 'Your review') ?? ''
    expect(card).toMatch(/<a[^>]*data-variant="default"[^>]*>Open your review<\/a>/)
    expect(card).toContain(`Comments due ${formatCivilDate(due ?? '')}`)
    expect(statusSentence(html)).toBe(
      `Waiting on: Reviewer (you). Comments due ${formatCivilDate(due ?? '')}.`,
    )
  })

  it('shows the project summary from the form answers and the plan documents', async () => {
    const html = await pageAs('reviewer', 'SPR-2026-0001')
    const summary = sectionOf(html, 'Project summary') ?? ''
    expect(summary).toContain('Demonstration board application')
    expect(summary).toContain('12000')
    expect(countSections(html, 'Plan documents')).toBe(1)
  })

  it('says plainly when no comment date is set', async () => {
    const html = await pageAs('reviewer', 'EL-2026-0003')
    expect(await commentDueFor('EL-2026-0003')).toBeNull()
    expect(sectionOf(html, 'Your review') ?? '').toContain('No comment date is set.')
    expect(statusSentence(html)).toBe('Waiting on: Reviewer (you). No comment date is set.')
    expect(sectionOf(html, 'Project summary') ?? '').toContain(
      'Replace the main panel and service entrance',
    )
    expect(sectionOf(html, 'Plan documents') ?? '').toContain('Panel schedule')
  })
})
