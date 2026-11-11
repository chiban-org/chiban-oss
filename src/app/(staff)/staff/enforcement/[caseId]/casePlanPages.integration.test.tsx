import { and, eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  complaints,
  documents,
  enforcementCases,
  enforcementOrders,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { designationCandidates } from '@/features/enforcement/officerList'
import { draftOrder } from '@/features/enforcement/orders'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { getPublicParcelView } from '@/features/parcels/publicParcelView'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { formatCivilDate } from '@/lib/formatDate'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'
import {
  ENFORCEMENT_ENUM_KEYS,
  findIsoDates,
  findRawKeys,
  findUuids,
  visibleText,
} from '@/test/leaks'

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

const { default: CasePage } = await import('@/app/(staff)/staff/enforcement/[caseId]/page')

const signal = new AbortController().signal
let handle: TestDb
let cases: { id: string; number: string; locationText: string; status: string }[] = []

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function pageFor(id: string): Promise<string> {
  return renderToStaticMarkup(
    (await CasePage({ params: Promise.resolve({ caseId: id }) })) as never,
  )
}

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  cases = (await handle.db.select().from(enforcementCases)).map((c) => ({
    id: c.id,
    number: c.number,
    locationText: c.locationText,
    status: c.status,
  }))
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

function byNumber(number: string): string {
  const found = cases.find((c) => c.number === number)
  if (found === undefined) throw new Error(`no case ${number}`)
  return found.id
}

function sentenceOf(page: string): string {
  return /data-slot="status-sentence"[^>]*>([^<]*)</.exec(page)?.[1] ?? ''
}

function cardOf(page: string): string {
  return /aria-label="Do this now"[\s\S]*?<\/section>/.exec(page)?.[0] ?? ''
}

describe('the case page status sentence, stage strip and Do this now card', () => {
  it.each([
    ['EC-2026-0007', /^Waiting on: Town \(Sam Clerk\)\. Start the investigation\.$/],
    ['EC-2026-0001', /^Waiting on: Town\. Draft a cease and desist order\.$/],
    ['EC-2026-0006', /^Waiting on: Town\. Send a notice of violation\.$/],
    [
      'EC-2026-0002',
      /^Waiting on: Town \(Sam Clerk\)\. Serve Robin Renter\. Answer due [A-Z][a-z]+ \d{1,2}, \d{4}, \d+ days? left\.$/,
    ],
    ['EC-2026-0004', /^Waiting on: Zoning Board of Adjustment\. Decide the appeal\.$/],
    ['EC-2026-0005', /^Waiting on: Town \(Sam Clerk\)\. Collect the \$75\.00 fine balance\.$/],
  ])('%s reads its step in the header', async (number, sentence) => {
    await actAs('staff')
    expect(sentenceOf(await pageFor(byNumber(number)))).toMatch(sentence)
  })

  it('every seeded case has at most one filled button and no Next step card', async () => {
    await actAs('staff')
    for (const c of cases) {
      const page = await pageFor(c.id)
      expect((page.match(/data-variant="default"/g) ?? []).length).toBeLessThanOrEqual(1)
      expect(page).not.toContain('aria-label="Next step"')
      expect(page).not.toContain('Move the case to')
    }
  })

  it('holds the step form open in the card with the filled button', async () => {
    await actAs('staff')
    const card = cardOf(await pageFor(byNumber('EC-2026-0002')))
    expect(visibleText(card)).toContain('Serve Robin Renter')
    expect(card).toMatch(/<button[^>]*data-variant="default"[^>]*>[\s\S]*?Record service/)
  })

  it('shows the stay as a Stayed stage and a card warning, with no yellow banner', async () => {
    await actAs('staff')
    const page = await pageFor(byNumber('EC-2026-0004'))
    expect(page).not.toContain('bg-highlight p-3')
    expect(visibleText(cardOf(page))).toMatch(
      /Warning:\s+Enforcement stayed by appeal to the ZBA filed .* \(RSA 676:6\)\./,
    )
    expect(page).toMatch(/aria-current="step"[^>]*>[\s\S]{0,400}?Stayed/)
  })

  it('lists the requirements before the motion with the unserved tenant', async () => {
    await actAs('staff')
    const text = visibleText(await pageFor(byNumber('EC-2026-0002')))
    expect(text).toContain('Before the motion to enforce')
    expect(text).toMatch(/Not done:\s+Service on the occupying tenant\s+Not served: Robin Renter\./)
    expect(text).not.toContain('Service on the owner agent')
  })

  it('puts Resolve under More actions as an outline button', async () => {
    await actAs('staff')
    const page = await pageFor(byNumber('EC-2026-0001'))
    const more = /<details class="more-actions"[\s\S]*?<\/details>/.exec(page)?.[0] ?? ''
    expect(more).toMatch(/<button[^>]*data-variant="outline"[^>]*>[\s\S]*?Resolve the case/)
  })
})

function panelOrder(page: string): string[] {
  const body = /class="record-body[\s\S]*/.exec(page)?.[0] ?? ''
  const history = body.indexOf('data-history-group')
  const empty = body.indexOf('data-empty-group')
  const cut = Math.min(...[history, empty, body.length].filter((i) => i >= 0))
  return [...body.slice(0, cut).matchAll(/<h2 id="([a-z]+)"/g)].map((m) => m[1] ?? '')
}

function historyOf(page: string): string {
  return (
    /<details data-history-group=""[\s\S]*?<\/details>\s*(?=<div data-empty-group|<\/div>)/.exec(
      page,
    )?.[0] ?? ''
  )
}

describe('the case page panels, strip and views', () => {
  it('leads an order in court with its orders, fines and counsel', async () => {
    await actAs('staff')
    const page = await pageFor(byNumber('EC-2026-0005'))
    expect(panelOrder(page).slice(0, 3)).toEqual(['orders', 'fines', 'counsel'])
  })

  it('folds complaints and notes into Record and history once the order is out', async () => {
    await actAs('staff')
    const page = await pageFor(byNumber('EC-2026-0002'))
    expect(panelOrder(page)[0]).toBe('orders')
    expect(panelOrder(page)).not.toContain('complaints')
    expect(panelOrder(page)).not.toContain('notes')
  })

  it('leads an investigation with its notes and keeps complaints in the body', async () => {
    await actAs('staff')
    const page = await pageFor(byNumber('EC-2026-0007'))
    expect(panelOrder(page).filter((key) => key !== 'requirements')[0]).not.toBe('orders')
    expect(historyOf(page)).toBe('')
  })

  it('moves the public site control from Complaints to the rail with its sentence', async () => {
    await actAs('staff')
    const page = await pageFor(byNumber('EC-2026-0006'))
    const rail = /<aside[\s\S]*?<\/aside>/.exec(page)?.[0] ?? ''
    expect(visibleText(rail)).toContain('This case is shown on the public site. Summary:')
    const complaints = /aria-labelledby="complaints"[\s\S]*?<\/section>/.exec(page)?.[0] ?? ''
    expect(complaints).not.toContain('public site')
  })

  it('gives phones a status strip with the due date and Facts and more actions', async () => {
    await actAs('staff')
    const page = await pageFor(byNumber('EC-2026-0002'))
    const strip = /class="record-strip[\s\S]*?<\/section>/.exec(page)?.[0] ?? ''
    expect(visibleText(strip)).toMatch(/Answer due [A-Z][a-z]+ \d{1,2}, \d{4}, \d+ days? left\./)
    expect(visibleText(strip)).toContain('Facts and more actions')
    expect(page).toMatch(/<aside class="record-rail[^"]* hidden"/)
  })

  it('says the answer counting rule once on the order', async () => {
    await actAs('staff')
    const text = visibleText(await pageFor(byNumber('EC-2026-0002')))
    expect(text.match(/RSA 21:35 II/g)?.length).toBe(1)
  })

  it('gives the unassigned inspector the field view: the step, quick actions, service, history, then facts', async () => {
    await actAs('inspector')
    const page = await pageFor(byNumber('EC-2026-0002'))
    const text = visibleText(page)
    const at = (needle: string) => text.indexOf(needle)
    expect(at('Do this now')).toBeGreaterThanOrEqual(0)
    expect(at('Add a photo')).toBeGreaterThan(at('Do this now'))
    expect(at('Add a note')).toBeGreaterThan(at('Add a photo'))
    expect(at('Service is not complete.')).toBeGreaterThan(at('Add a note'))
    expect(at('Findings and notices of violation')).toBeGreaterThan(at('Service is not complete.'))
    expect(at('Case facts and more actions')).toBeGreaterThan(
      at('Findings and notices of violation'),
    )
    expect(text).not.toContain('Requirements')
    expect(visibleText(/<aside[\s\S]*?<\/aside>/.exec(page)?.[0] ?? '').trim()).toBe('')
    expect(text.match(/Service is not complete\./g)?.length).toBe(1)
    expect(cardOf(page)).toMatch(/<button[^>]*data-variant="default"[^>]*>[\s\S]*?Record service/)
  })

  it('gives the administrator the counsel view with the summary and only the actions that apply', async () => {
    await actAs('admin')
    const page = await pageFor(byNumber('EC-2026-0005'))
    const text = visibleText(page)
    expect(sentenceOf(page)).toMatch(/^Waiting on: Town/)
    expect(page).not.toContain('aria-label="Do this now"')
    expect(text).toContain('Case summary')
    expect(text).toContain('Record a court-imposed fine')
    expect(text).toContain('Refer to counsel')
    expect(panelOrder(page)).toEqual(['summary', 'counsel', 'fines'])
    expect(historyOf(page)).toContain('Cease and desist orders')
  })

  it('offers the administrator no counsel referral before an order is in force', async () => {
    await actAs('admin')
    const text = visibleText(await pageFor(byNumber('EC-2026-0001')))
    expect(text).not.toContain('Refer to counsel')
    expect(text).not.toContain('Record a court-imposed fine')
  })
})

describe('the field view on a draft order', () => {
  it('lets the inspector complete the draft the step asks to complete before issuing it', async () => {
    await actAs('staff')
    const caseId = byNumber('EC-2026-0001')
    const [finding] = await handle.db
      .select()
      .from(violationFindings)
      .where(eq(violationFindings.caseId, caseId))
      .limit(1)
    if (finding === undefined) throw new Error('no finding')
    const drafted = await draftOrder(
      handle.db,
      state.actor as Actor,
      {
        caseId,
        findingIds: [finding.id],
        correctiveAction: '',
        correctiveDeadline: null,
        ceaseImmediately: false,
      },
      signal,
    )
    if (!drafted.ok) throw new Error(drafted.error)
    await actAs('inspector')
    const page = await pageFor(caseId)
    expect(visibleText(cardOf(page))).toContain('Write the corrective action in the draft')
    expect(visibleText(page)).toContain('Save the draft')
  })
})
