import { and, isNull } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { documents, enforcementCases, legalHolds, retentionAssignments } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { retentionFor } from '@/features/records/disposition'
import { retentionWorklist, WORKLIST_STATES } from '@/features/records/worklist'
import { townToday } from '@/features/town/today'
import { makeTestDb, type TestDb } from '@/test/db'
import { visibleText } from '@/test/leaks'

interface MockState {
  db: unknown
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

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

const { default: RetentionPage } = await import('@/app/(staff)/staff/records/retention/page')
const { default: HoldsPage } = await import('@/app/(staff)/staff/records/holds/page')
const { default: PreservationPage } = await import('@/app/(staff)/staff/records/preservation/page')
const { default: QueuePage } = await import('@/app/(staff)/staff/enforcement/page')
const { default: CasePage } = await import('@/app/(staff)/staff/enforcement/[caseId]/page')
const { default: RequestsPage } = await import('@/app/(staff)/staff/records/requests/page')
const { default: DisposedPage } = await import('@/app/(staff)/staff/records/disposed/page')

const signal = new AbortController().signal
let handle: TestDb

async function actAs(local: string): Promise<Actor> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  state.actor = actor
  return actor as Actor
}

const html = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as never)
const search = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) })

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
})
afterAll(async () => {
  await handle.drop()
})

async function expectedStates(asOf: string): Promise<Map<string, string>> {
  const live = await handle.db
    .select({ kind: retentionAssignments.recordKind, id: retentionAssignments.recordId })
    .from(retentionAssignments)
    .where(isNull(retentionAssignments.supersededAt))
  const disposed = new Set(
    (await handle.db.select().from(documents))
      .filter((d) => d.disposedAt !== null)
      .map((d) => d.id),
  )
  const expected = new Map<string, string>()
  for (const ref of live) {
    if (disposed.has(ref.id)) continue
    const found = await retentionFor(handle.db, ref, signal)
    if (found === null || found.status.state === 'permanent') continue
    const { status } = found
    let state: string | null = null
    if (found.holds.length > 0) state = 'on_hold'
    else if (status.state === 'not_yet_triggered') state = 'awaiting_event'
    else if (status.date <= asOf) state = 'eligible'
    if (state !== null) expected.set(`${ref.kind}:${ref.id}`, `${state} ${JSON.stringify(status)}`)
  }
  return expected
}

describe('retention worklist in the database', () => {
  it('puts every demo record in the same state, with the same dates, as retentionFor', async () => {
    const actor = await actAs('records')
    const asOf = await townToday(handle.db, new Date(), signal)
    const actual = new Map<string, string>()
    for (const state of WORKLIST_STATES) {
      const page = await retentionWorklist(handle.db, actor, { asOf, state, limit: 200 }, signal)
      expect(page.total).toBe(page.rows.length)
      for (const r of page.rows) {
        actual.set(`${r.ref.kind}:${r.ref.id}`, `${state} ${JSON.stringify(r.status)}`)
      }
    }
    const expected = await expectedStates(asOf)
    expect(expected.size).toBeGreaterThan(0)
    expect(actual).toEqual(expected)
  })

  it('the retention page shows tabs with counts and a table that links each record and names its kind', async () => {
    await actAs('records')
    const markup = await html(RetentionPage(search({ state: 'awaiting_event' })))
    expect(markup).toContain('<main data-wide=""')
    expect(markup).toMatch(/aria-current="page"[^>]*>Waiting for an event<span[^>]*>\d+<\/span>/)
    expect(markup).toContain('<table')
    expect(markup).toMatch(/href="\/staff\/(enforcement|applications|parcels)\/[0-9a-f-]{36}"/)
    expect(visibleText(markup)).toContain('Application snapshot')
    expect(markup).toContain('<summary>Record event</summary>')
    expect(visibleText(markup)).toContain('Earliest eligible date first.')
  })
})

describe('holds, preservation and the other lists', () => {
  it('legal holds split into Active and Released tabs with the subject linked', async () => {
    await actAs('records')
    const markup = await html(HoldsPage(search()))
    expect(markup).toMatch(/aria-current="page"[^>]*>Active<span[^>]*>1<\/span>/)
    expect(markup).toContain('>Released<')
    expect(markup).toMatch(/<a href="\/staff\/parcels\/[0-9a-f-]{36}">/)
    expect(markup).toContain('<summary>Release</summary>')
    expect(markup).toMatch(/>Place a hold<\/button>/)
    expect(markup.indexOf('>Place a hold<')).toBeLessThan(markup.indexOf('<table'))
    const [hold] = await handle.db
      .select()
      .from(legalHolds)
      .where(and(isNull(legalHolds.releasedAt)))
    expect(visibleText(markup)).toContain(hold?.reason ?? 'missing')
    const released = visibleText(await html(HoldsPage(search({ state: 'released' }))))
    expect(released).toContain('No hold has been released yet.')
  })

  it('the preservation queue is a wide table', async () => {
    await actAs('records')
    const markup = await html(PreservationPage())
    expect(markup).toContain('<main data-wide="">')
    expect(markup).toContain('class="table-panel"')
  })

  it('each list says how it is sorted and request numbers do not wrap', async () => {
    await actAs('records')
    const requests = await html(RequestsPage(search()))
    expect(visibleText(requests)).toContain('Soonest next date first.')
    expect(requests).toMatch(/<td class="whitespace-nowrap"><a href="\/staff\/records\/requests\//)
    expect(requests.indexOf('>Log a request<')).toBeGreaterThan(-1)
    expect(requests.indexOf('>Log a request<')).toBeLessThan(requests.indexOf('<table'))
    expect(visibleText(await html(DisposedPage(search())))).toContain(
      'Most recently disposed first.',
    )
    await actAs('staff')
    const queue = await html(QueuePage(search()))
    expect(visibleText(queue)).toContain('Newest case first.')
    expect(queue.indexOf('>Open a case<')).toBeGreaterThan(-1)
    expect(queue.indexOf('>Enter a complaint<')).toBeLessThan(queue.indexOf('<table'))
  })

  it('the disposed list sorts by proposer and approver from their headers', async () => {
    await actAs('records')
    const markup = await html(DisposedPage(search()))
    expect(markup).toContain('sort=proposer')
    expect(markup).toContain('sort=approver')
  })

  it('a case page states the opened date once per layout, in the rail and in the phone strip', async () => {
    await actAs('staff')
    const [found] = await handle.db.select().from(enforcementCases).limit(1)
    const markup = await html(CasePage({ params: Promise.resolve({ caseId: found?.id ?? '' }) }))
    const rail = markup.slice(markup.indexOf('<aside'), markup.indexOf('</aside>'))
    const strip = markup.slice(markup.indexOf('record-strip'), markup.indexOf('<aside'))
    const outside =
      markup.slice(0, markup.indexOf('record-strip')) + markup.slice(markup.indexOf('</aside>'))
    expect(visibleText(rail).match(/Opened/g)?.length).toBe(1)
    expect(visibleText(strip).match(/Opened/g)?.length ?? 0).toBeLessThanOrEqual(1)
    expect(visibleText(outside).match(/Opened/g)).toBeNull()
  })
})
