import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, codeEditionRecords } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { overrideAdministrativeGate, recordStatutoryException } from '@/features/gates/overrides'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { filledButtons, sectionOf, workArea } from '@/test/htmlSections'
import type { CivilDate } from '@/types/civilDate'

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
let admin: Actor
let clerk: Actor

async function actorFor(local: string): Promise<Actor> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: is }) => is(u.email, `${local}@alderpond.example`),
  })
  const actor = await loadActor(handle.db, user?.id ?? '', signal)
  if (actor === null) throw new Error(`no ${local}`)
  return actor
}

async function page(number: string): Promise<string> {
  const id = ids.get(number) ?? ''
  return renderToStaticMarkup(
    (await ApplicationPage({ params: Promise.resolve({ applicationId: id }) })) as never,
  )
}

function nextStep(html: string): string {
  return workArea(html)
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  admin = await actorFor('admin')
  clerk = await actorFor('staff')
  state.actor = clerk
  const rows = await handle.db.select().from(applications)
  ids = new Map(rows.map((r) => [r.number, r.id]))
})
afterAll(async () => {
  await handle.drop()
})

describe('the next step follows the gates', () => {
  it('lists each blocker with a link to its panel and offers no filled move while blocked', async () => {
    const rail = nextStep(await page('SPR-2026-0002'))
    expect(rail).toContain('Before it can be issued')
    expect(rail).toContain('href="#fees-and-payments"')
    expect(rail).toContain('href="#conditions"')
    expect(filledButtons(rail)).not.toContain('Issue the permit')
    expect(filledButtons(rail).length).toBeLessThanOrEqual(1)
  })

  it('makes the move the filled primary once every gate is cleared by override', async () => {
    const applicationId = ids.get('SPR-2026-0002') ?? ''
    const app = await loadApplicationContext(handle.db, applicationId, signal)
    if (app === null) throw new Error('no app')
    const results = await handle.db.transaction((tx) =>
      evaluateGates(tx, app, 'issued', '2026-11-03' as CivilDate, signal),
    )
    for (const gate of results.filter((g) => g.effective === 'blocked')) {
      const done =
        gate.kind === 'administrative'
          ? await overrideAdministrativeGate(
              handle.db,
              clerk,
              { applicationId, gateKey: gate.key, reason: 'Cleared for the rail test.' },
              signal,
            )
          : await recordStatutoryException(
              handle.db,
              admin,
              {
                applicationId,
                gateKey: gate.key,
                legalAuthority: { citation: 'RSA 1:1', explanation: 'Cleared for the rail test.' },
              },
              signal,
            )
      expect(done).toEqual({ ok: true, value: undefined })
    }
    const rail = nextStep(await page('SPR-2026-0002'))
    expect(filledButtons(rail)).toEqual(['Issue the permit'])
    expect(sectionOf(rail, 'Before it can be issued') ?? '').not.toContain('Not done: ')
    expect(rail).toContain('Overridden: Cleared for the rail test.')
  })

  it('never makes withdrawn, denied, closed or expired the filled move', async () => {
    for (const number of ids.keys()) {
      const filled = filledButtons(nextStep(await page(number)))
      expect(filled.filter((label) => /withdraw|deny|close|expire/i.test(label))).toEqual([])
    }
  })

  it('does not repeat a gate label at the start of its detail', async () => {
    const html = await page('BP-2026-0003')
    expect(html).toContain('Suspended by appeal (RSA 676:6)')
    expect(html).not.toContain('Suspended by appeal (RSA 676:6). Resolve')
    expect(html).toContain('Resolve the appeal first.')
  })

  it('does not offer closing while the appeal blocks it, and links the blocker to Appeals', async () => {
    const rail = nextStep(await page('BP-2026-0003'))
    expect(rail).not.toContain('Move to closed')
    expect(rail).not.toContain('>Close the permit<')
    expect(rail).toContain('href="#appeals"')
  })

  it('surfaces a review stage with nobody assigned as a blocker linked to Reviewers', async () => {
    const rail = nextStep(await page('BP-2026-0002'))
    expect(rail).toContain('No reviewer is assigned.')
    expect(rail).toContain('href="#reviewers"')
    expect(filledButtons(rail)).toEqual(['Assign reviewer'])
  })

  it('surfaces a missing code edition as an issuance blocker', async () => {
    const applicationId = ids.get('BP-2025-0001') ?? ''
    await handle.db
      .delete(codeEditionRecords)
      .where(eq(codeEditionRecords.applicationId, applicationId))
    await handle.db
      .update(applications)
      .set({ state: 'decided' })
      .where(eq(applications.id, applicationId))
    const rail = nextStep(await page('BP-2025-0001'))
    expect(rail).toContain('Code edition recorded')
    expect(rail).toContain('href="#code-edition"')
  })
})

describe('deadlines above the fold', () => {
  it('shows the next deadline and the overdue count, and tints the header chip', async () => {
    const html = await page('BP-2026-0005')
    const facts = sectionOf(html, 'Deadlines') ?? ''
    const sentence = /data-slot="status-sentence">([^<]*)</.exec(html)?.[1] ?? ''
    expect(sentence).toMatch(/\d+ days? overdue\.$/)
    expect(facts).toContain('Due next')
    expect(facts).toMatch(/\d+ days? overdue/)
    expect(facts).not.toContain('Overdue clocks')
    expect(facts).not.toContain('more overdue')
    const header = html.slice(0, html.indexOf('</header>'))
    expect(header).toContain('data-status="overdue"')
  })

  it('keeps the status chip in the header only, not again in the phone status strip', async () => {
    const html = await page('BP-2026-0005')
    expect(sectionOf(html, 'Status') ?? 'missing').not.toContain('data-status=')
  })

  it('lists clocks overdue first and folds met and stopped clocks to one line', async () => {
    const clocks = sectionOf(await page('BP-2026-0003'), 'Clocks') ?? ''
    expect(clocks).not.toContain('version 1, pack')
    expect(clocks.match(/<article[^>]*data-collapsed/g)).toHaveLength(2)
    expect(clocks).toContain('Building permit decision deadline')
    const late = sectionOf(await page('BP-2026-0005'), 'Clocks') ?? ''
    expect(late.split('<article')[1]).toMatch(/Overdue by|Past due by/)
  })
})
