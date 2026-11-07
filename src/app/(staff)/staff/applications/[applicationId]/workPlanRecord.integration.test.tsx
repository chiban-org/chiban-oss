import { and, asc, eq, inArray } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { abutterLists, acceptanceSchedules, applications, boardMeetings, clocks } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
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
let clerk: Actor
const ids = new Map<string, string>()

async function page(number: string): Promise<string> {
  state.actor = clerk
  return renderToStaticMarkup(
    (await ApplicationPage({
      params: Promise.resolve({ applicationId: ids.get(number) ?? '' }),
    })) as never,
  )
}

function sentence(html: string): string {
  return /data-slot="status-sentence"[^>]*>([^<]*)</.exec(html)?.[1] ?? ''
}

async function nextDue(number: string): Promise<string> {
  const [clock] = await handle.db
    .select({ due: clocks.currentDue })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, ids.get(number) ?? ''),
        inArray(clocks.status, ['running', 'overdue']),
      ),
    )
    .orderBy(asc(clocks.currentDue))
  return formatCivilDate(clock?.due ?? '')
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, 'staff@alderpond.example'),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  if (actor === null) throw new Error('no clerk')
  clerk = actor
  for (const row of await handle.db.select().from(applications)) ids.set(row.number, row.id)
})
afterAll(async () => {
  await handle.drop()
})

describe('the building permit under review, as the clerk', () => {
  it('opens the reviewer form in Do this now as the one filled button, and nowhere else', async () => {
    const html = await page('BP-2026-0001')
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).toContain('Assign a reviewer')
    expect(filledButtons(card)).toEqual(['Assign reviewer'])
    expect(filledButtons(html)).toEqual(['Assign reviewer'])
    expect(html.match(/name="reviewerUserId"/g)).toHaveLength(1)
  })

  it('says who acts, what, and when the decision is due', async () => {
    const html = await page('BP-2026-0001')
    expect(sentence(html).startsWith('Waiting on: Town')).toBe(true)
    expect(sentence(html)).toContain('. Assign a reviewer. ')
    expect(sentence(html)).toContain(await nextDue('BP-2026-0001'))
  })

  it('lists what blocks issuance while the next move is still the review', async () => {
    const requirements = sectionOf(await page('BP-2026-0001'), 'Requirements') ?? ''
    expect(requirements).toContain('Before the decision')
    expect(requirements).toContain('Before it can be issued')
    expect(sectionOf(requirements, 'Before it can be issued') ?? '').toContain('Fees paid')
  })
})

function stages(html: string): string[] {
  const strip = /<ol aria-label="Progress"[\s\S]*?<\/ol>/.exec(html)?.[0] ?? ''
  return [
    ...strip.matchAll(/<li[^>]*data-status="([a-z]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g),
  ].map((m) => `${m[2]}:${m[1]}`)
}

describe('the stage strip', () => {
  it('marks review as the current stage of the building permit in review', async () => {
    expect(stages(await page('BP-2026-0001'))).toEqual([
      'Submitted:done',
      'Complete:done',
      'Review:current',
      'Decided:upcoming',
      'Issued:upcoming',
      'Inspections:upcoming',
      'Closed:upcoming',
    ])
  })

  it('marks acceptance as the current stage of the filed site plan', async () => {
    expect(stages(await page('SPR-2026-0001'))).toEqual([
      'Filed:done',
      'Accepted:current',
      'Hearing:upcoming',
      'Decision:upcoming',
      'Appeal period:upcoming',
    ])
  })
})

describe('the filed site plan, as the clerk', () => {
  it('waits on the Planning Board for the vote at the meeting on file, warning that it is after the deadline', async () => {
    const [meeting] = await handle.db
      .select({ date: boardMeetings.meetingDate })
      .from(acceptanceSchedules)
      .innerJoin(boardMeetings, eq(boardMeetings.id, acceptanceSchedules.meetingId))
      .where(eq(acceptanceSchedules.applicationId, ids.get('SPR-2026-0001') ?? ''))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-06T16:00:00Z'))
    const html = await page('SPR-2026-0001').finally(() => vi.useRealTimers())
    expect(sentence(html)).toContain(
      `Waiting on: Alder Pond Planning Board. Vote on completeness at the meeting on ${formatCivilDate(meeting?.date ?? '')}.`,
    )
    expect(sectionOf(html, 'Do this now') ?? '').toContain(
      `The meeting set, ${formatCivilDate(meeting?.date ?? '')}, is after this deadline`,
    )
    expect(sentence(html)).toContain(await nextDue('SPR-2026-0001'))
    expect(sectionOf(html, 'Requirements') ?? '').toContain('Before the hearing')
  })
})

describe('the variance waiting on its abutter list, as the clerk', () => {
  it('links the draft list from Do this now as the one filled control', async () => {
    const [draft] = await handle.db
      .select({ id: abutterLists.id, version: abutterLists.version })
      .from(abutterLists)
      .where(
        and(
          eq(abutterLists.applicationId, ids.get('VAR-2026-0001') ?? ''),
          eq(abutterLists.status, 'draft'),
        ),
      )
    const html = await page('VAR-2026-0001')
    const card = sectionOf(html, 'Do this now') ?? ''
    expect(card).toContain('Issue the abutter list')
    expect(card).toMatch(
      new RegExp(
        `<a[^>]*data-variant="default"[^>]*href="/staff/abutters/${draft?.id}"[^>]*>Open version ${draft?.version} to issue it</a>`,
      ),
    )
    expect(filledButtons(html)).toEqual([])
  })
})

describe('the ends of the workflow', () => {
  it('a draft waits on the applicant and offers no card', async () => {
    const html = await page('BP-2026-0006')
    expect(sentence(html)).toBe('Waiting on the applicant to submit.')
    expect(countSections(html, 'Do this now')).toBe(0)
  })

  it('a closed permit shows its outcome with no card, requirements or dead print links', async () => {
    const html = await page('BP-2026-0004')
    expect(sentence(html)).toBe('This permit is closed.')
    expect(countSections(html, 'Do this now')).toBe(0)
    expect(countSections(html, 'Requirements')).toBe(0)
    expect(html).not.toContain('Print permit')
  })

  it('an issued permit keeps its print links, which the PDF endpoints serve only while issued', async () => {
    expect(await page('BP-2025-0001')).toContain('Print permit')
  })
})
