import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { dispositionBatches } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { WORKLIST_STATES } from '@/features/records/worklist'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'
import { findIsoDates, findRawKeys, findUuids, RECORDS_ENUM_KEYS, visibleText } from '@/test/leaks'

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
const { default: BatchPage } = await import(
  '@/app/(staff)/staff/records/disposition/[batchId]/page'
)
const { default: DisposedPage } = await import('@/app/(staff)/staff/records/disposed/page')

const signal = new AbortController().signal
let handle: TestDb

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

const html = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as never)
const search = (params: Record<string, string> = {}) => ({ searchParams: Promise.resolve(params) })

function expectHuman(page: string): void {
  const text = visibleText(page)
  expect(findIsoDates(text)).toEqual([])
  expect(findUuids(text)).toEqual([])
  expect(findRawKeys(text, RECORDS_ENUM_KEYS)).toEqual([])
}

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('retention and disposition screens with the demo seed', () => {
  it('every retention tab and the batch page read as plain text', async () => {
    await actAs('records')
    for (const state_ of WORKLIST_STATES) {
      expectHuman(await html(RetentionPage(search({ state: state_ }))))
    }
    const [batch] = await handle.db.select().from(dispositionBatches)
    const batchPage = await html(
      BatchPage({ params: Promise.resolve({ batchId: batch?.id ?? '' }), ...search() }),
    )
    expect(batchPage).toContain('Disposed of')
    expectHuman(batchPage)
  })

  it('the batch page shows each record series and who proposed and approved the batch, and batches are told apart', async () => {
    await actAs('records')
    const [batch] = await handle.db.select().from(dispositionBatches)
    const page = visibleText(
      await html(BatchPage({ params: Promise.resolve({ batchId: batch?.id ?? '' }), ...search() })),
    )
    expect(page).toContain('Retention series')
    expect(page).toMatch(/Proposed\s+[A-Z][a-z]+ [A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}/)
    expect(page).toMatch(/Approved\s+[A-Z][a-z]+ [A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}/)
    const list = await html(RetentionPage(search()))
    expect(list).toContain(`href="/staff/records/disposition/${batch?.id}"`)
    expect(visibleText(list)).toMatch(/[A-Z][a-z]+ \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M/)
  })

  it('retention and disposition screens show the worklist rows and the tombstone batch', async () => {
    await actAs('records')
    const eligible = visibleText(await html(RetentionPage(search({ state: 'eligible' }))))
    expect(eligible).toContain('Resolved complaint photo log')
    expect(eligible).toContain('Eligible later')
    const waiting = visibleText(await html(RetentionPage(search({ state: 'awaiting_event' }))))
    expect(waiting).toContain('Open complaint photo log')
    expect(waiting).toContain('The appeal period ended')
    const held = visibleText(await html(RetentionPage(search({ state: 'on_hold' }))))
    expect(held).toContain('Records kept permanently are not listed here')
    expect(held).toContain('Legal holds')
    expect(visibleText(await html(RetentionPage(search({ state: 'eligible' }))))).not.toContain(
      'Records kept permanently are not listed here',
    )
  })

  it('a registration waiting to expire offers no unrelated events and says Chiban records the expiry', async () => {
    await actAs('records')
    const markup = await html(RetentionPage(search({ state: 'awaiting_event' })))
    const row = markup.split('<tr').find((part) => part.includes('AR-2026-0001')) ?? ''
    expect(row).not.toBe('')
    expect(row).not.toContain('The building was removed')
    expect(visibleText(row)).toContain('Chiban records this when the registration expires.')
  })

  it('the disposed records page lists each tombstone read-only and is closed to reviewers', async () => {
    await actAs('records')
    const [batch] = await handle.db
      .select()
      .from(dispositionBatches)
      .where(eq(dispositionBatches.status, 'executed'))
    const markup = await html(DisposedPage(search()))
    const page = visibleText(markup)
    expect(page).toContain('Disposed records')
    expect(page).toContain('Closed complaint photo log')
    expect(markup).toContain(`href="/staff/records/disposition/${batch?.id}"`)
    expect(markup).not.toContain('<form')
    expectHuman(page)
    expect(visibleText(await html(RetentionPage(search())))).toContain('Disposed records')
    await actAs('reviewer')
    expect(await html(DisposedPage(search()))).toContain('You do not have permission')
  })

  it('a proposed batch says who may approve it instead of offering approval to its proposer', async () => {
    const proposer = await handle.db.query.users.findFirst({
      where: (u, { eq: is }) => is(u.email, 'records@alderpond.example'),
    })
    const [batch] = await handle.db
      .insert(dispositionBatches)
      .values({ asOf: '2026-10-01', proposedBy: proposer?.id ?? '' })
      .returning({ id: dispositionBatches.id })
    const render = async () =>
      visibleText(
        await html(
          BatchPage({ params: Promise.resolve({ batchId: batch?.id ?? '' }), ...search() }),
        ),
      )
    try {
      await actAs('records')
      const own = await render()
      expect(own).toContain('You proposed this batch, so another records custodian approves it.')
      expect(own).not.toContain('Approve and carry out')
      await actAs('staff')
      expect(await render()).toContain('A records custodian approves it.')
    } finally {
      await handle.db.delete(dispositionBatches).where(eq(dispositionBatches.id, batch?.id ?? ''))
    }
  })
})
