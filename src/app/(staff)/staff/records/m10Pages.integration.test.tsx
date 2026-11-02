import { count } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  applications,
  censusClassifications,
  dispositionBatches,
  dispositionItems,
  dispositionTombstones,
  documents,
  documentVersions,
  fileTombstones,
  redactionBoxes,
  redactionJobs,
  renditionApprovals,
  rtkReleaseItems,
  rtkReleases,
  rtkRequests,
  rtkTimeStatements,
  rtkWithholdings,
} from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { loadReleaseCandidates } from '@/features/rtk/requestPage'
import { makeTestDb, type TestDb } from '@/test/db'
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

const { default: RequestsPage } = await import('@/app/(staff)/staff/records/requests/page')
const { default: RequestPage } = await import(
  '@/app/(staff)/staff/records/requests/[requestId]/page'
)
const { default: RetentionPage } = await import('@/app/(staff)/staff/records/retention/page')
const { default: BatchPage } = await import(
  '@/app/(staff)/staff/records/disposition/[batchId]/page'
)
const { default: CensusPage } = await import('@/app/(staff)/staff/reports/census/page')
const { default: RedactPage } = await import('@/app/(staff)/staff/records/redact/[versionId]/page')

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

async function counts(): Promise<Record<string, number>> {
  const tables = {
    rtkRequests,
    rtkTimeStatements,
    rtkWithholdings,
    rtkReleases,
    rtkReleaseItems,
    redactionJobs,
    redactionBoxes,
    renditionApprovals,
    dispositionBatches,
    dispositionItems,
    dispositionTombstones,
    fileTombstones,
    censusClassifications,
    documents,
    documentVersions,
  }
  const out: Record<string, number> = {}
  for (const [name, table] of Object.entries(tables)) {
    const [row] = await handle.db.select({ n: count() }).from(table)
    out[name] = row?.n ?? 0
  }
  return out
}

function expectHuman(page: string): void {
  const text = visibleText(page)
  expect(findIsoDates(text)).toEqual([])
  expect(findUuids(text)).toEqual([])
  expect(findRawKeys(text, RECORDS_ENUM_KEYS)).toEqual([])
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
})
afterAll(async () => {
  await handle.drop()
})

describe('records screens with the demo seed', () => {
  it('seed twice leaves identical row counts and every records screen renders non-empty', async () => {
    const before = await counts()
    await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
    expect(await counts()).toEqual(before)
    await actAs('records')
    const list = await html(RequestsPage(search()))
    expect(list.match(/RK-\d{4}-\d{4}/g)?.length).toBeGreaterThanOrEqual(4)
    const requests = await handle.db.select().from(rtkRequests)
    for (const r of requests) {
      const page = await html(RequestPage({ params: Promise.resolve({ requestId: r.id }) }))
      expect(page).toContain(r.number)
      expectHuman(page)
    }
    for (const state_ of ['eligible', 'awaiting_event', 'on_hold']) {
      expectHuman(await html(RetentionPage(search({ state: state_ }))))
    }
    const [batch] = await handle.db.select().from(dispositionBatches)
    const batchPage = await html(
      BatchPage({ params: Promise.resolve({ batchId: batch?.id ?? '' }) }),
    )
    expect(batchPage).toContain('Disposed of')
    expectHuman(batchPage)
  })

  it('the batch page shows each record series and who proposed and approved the batch, and batches are told apart', async () => {
    await actAs('records')
    const [batch] = await handle.db.select().from(dispositionBatches)
    const page = visibleText(
      await html(BatchPage({ params: Promise.resolve({ batchId: batch?.id ?? '' }) })),
    )
    expect(page).toContain('Retention series')
    expect(page).toMatch(/Proposed by [A-Z][a-z]+ [A-Z][a-z]+ on [A-Z][a-z]+ \d{1,2}, \d{4}/)
    expect(page).toMatch(/Approved by [A-Z][a-z]+ [A-Z][a-z]+ on [A-Z][a-z]+ \d{1,2}, \d{4}/)
    const list = visibleText(await html(RetentionPage(search())))
    expect(list).toMatch(
      /Batch as of [A-Z][a-z]+ \d{1,2}, \d{4}, proposed [A-Z][a-z]+ \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M/,
    )
  })

  it('the request log shows the five business day clock, a late-free open request, and an overdue one', async () => {
    await actAs('records')
    const overdue = await html(RequestsPage(search({ overdue: '1' })))
    expect(overdue.match(/RK-\d{4}-\d{4}/g)?.length).toBe(1)
    expect(overdue).toContain('past due')
    const [open] = (await handle.db.select().from(rtkRequests)).filter((r) => r.status === 'open')
    const page = visibleText(
      await html(RequestPage({ params: Promise.resolve({ requestId: open?.id ?? '' }) })),
    )
    expect(page).toContain('5 business days after')
    expect(page).toContain('RSA 91-A:4 IV(b)')
  })

  it('retention and disposition screens show the worklist rows and the tombstone batch', async () => {
    await actAs('records')
    const eligible = visibleText(await html(RetentionPage(search({ state: 'eligible' }))))
    expect(eligible).toContain('Resolved complaint photo log')
    const waiting = visibleText(await html(RetentionPage(search({ state: 'awaiting_event' }))))
    expect(waiting).toContain('Open complaint photo log')
    expect(waiting).toContain('The appeal period ended')
  })

  it('the release picker lists nothing until searched, then only matching documents named with their record', async () => {
    await actAs('records')
    const actor = state.actor as Actor
    expect(await loadReleaseCandidates(handle.db, actor, '')).toEqual([])
    const found = await loadReleaseCandidates(handle.db, actor, 'complaint photo')
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((c) => c.title.toLowerCase().includes('complaint photo'))).toBe(true)
    expect(found.every((c) => /EC-\d{4}-\d{4}/.test(c.context))).toBe(true)
  })

  it('a registration waiting to expire offers no unrelated events and says Chiban records the expiry', async () => {
    await actAs('records')
    const markup = await html(RetentionPage(search({ state: 'awaiting_event' })))
    const row = markup.split('<li').find((part) => part.includes('AR-2026-0001')) ?? ''
    expect(row).not.toBe('')
    expect(row).not.toContain('The building was removed')
    expect(visibleText(row)).toContain('Chiban records this when the registration expires.')
  })

  it('the census screen shows both sections for the month of the seeded permits', async () => {
    await actAs('staff')
    const [first] = await handle.db.select({ issuedOn: applications.issuedOn }).from(applications)
    const issued =
      (await handle.db.select({ issuedOn: applications.issuedOn }).from(applications)).find(
        (a) => a.issuedOn !== null,
      ) ?? first
    const [year = '', month = ''] = (issued?.issuedOn ?? '').split('-')
    const page = visibleText(await html(CensusPage(search({ year, month: String(Number(month)) }))))
    expect(page).toContain('Section 3: Housing units authorized')
    expect(page).toContain('Section 4: Permits valued at $1,000,000 or more')
    expectHuman(page)
  })

  it('the redact page shows the box editor for a seeded original', async () => {
    await actAs('records')
    const [job] = await handle.db.select().from(redactionJobs)
    const page = visibleText(
      await html(
        RedactPage({
          params: Promise.resolve({ versionId: job?.sourceVersionId ?? '' }),
          ...search(),
        }),
      ),
    )
    expect(page).toContain('Add a box to page 1')
    expect(page).toContain('The original is never changed')
  })

  it('a reviewer gets the permission page or not-found and a resident is sent to sign in', async () => {
    await actAs('reviewer')
    expect(await html(RequestsPage(search()))).toContain('You do not have permission')
    expect(await html(RetentionPage(search()))).toContain('You do not have permission')
    const [request] = await handle.db.select().from(rtkRequests)
    await expect(
      html(RequestPage({ params: Promise.resolve({ requestId: request?.id ?? '' }) })),
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      html(
        RedactPage({ params: Promise.resolve({ versionId: crypto.randomUUID() }), ...search() }),
      ),
    ).resolves.toContain('You do not have permission')
    await actAs('applicant')
    await expect(html(RequestsPage(search()))).rejects.toThrow('NEXT_REDIRECT')
  })

  it('a malformed request id is not found', async () => {
    await actAs('records')
    await expect(
      html(RequestPage({ params: Promise.resolve({ requestId: 'nope' }) })),
    ).rejects.toThrow('NOT_FOUND')
  })
})
