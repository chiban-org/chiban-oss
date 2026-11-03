import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { importExceptions } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { exceptionParcelId } from '@/features/gis/exceptionView'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'

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
  usePathname: () => '/staff',
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ExceptionsPage } = await import('./exceptions/page')
const { default: ImportsPage } = await import('./imports/page')
const { default: RunPage } = await import('./imports/[runId]/page')

const signal = new AbortController().signal
let handle: TestDb

async function actAs(email: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${email}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function exceptionsHtml(query: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await ExceptionsPage({ searchParams: Promise.resolve(query) }))
}

async function ownerChange() {
  const rows = await handle.db.query.importExceptions.findMany({
    where: (e, { eq }) => eq(e.kind, 'owner_changed'),
  })
  const row = rows.find((r) => r.status === 'open')
  if (row === undefined) throw new Error('demo has no open owner change')
  return row
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
})
afterAll(async () => {
  await handle.drop()
})

describe('import exceptions page', () => {
  it('gives the records custodian a read-only list', async () => {
    await actAs('records')
    const html = await exceptionsHtml()
    expect(html).toContain('Owner changed')
    for (const action of ['>Dismiss<', '>Apply held row<', 'Accept all owner changes']) {
      expect(html).not.toContain(action)
    }
    expect(html).not.toContain('name="reason"')
  })

  it('names the import each bulk accept belongs to and links to it', async () => {
    await actAs('staff')
    const row = await ownerChange()
    const html = await exceptionsHtml()
    expect(html).toContain('>Dismiss<')
    expect(html).toContain('>Apply held row<')
    expect(html).toContain(`href="/staff/gis/imports/${row.lastSeenRunId}"`)
    expect(html.match(/Accept all owner changes from this import/g)?.length).toBe(
      new Set(
        (await handle.db.select().from(importExceptions))
          .filter((r) => r.kind === 'owner_changed' && r.status === 'open')
          .map((r) => r.lastSeenRunId),
      ).size,
    )
  })

  it('links the parcel from the row title', async () => {
    await actAs('staff')
    const parcelId = exceptionParcelId((await ownerChange()).payload)
    const html = await exceptionsHtml()
    expect(html).toContain(`href="/staff/parcels/${parcelId}"`)
    expect(html).not.toContain('Open the parcel')
  })

  it('shows status as tabs with counts and kind as one-pick filter in plain words', async () => {
    await actAs('staff')
    const html = await exceptionsHtml()
    expect(html).toMatch(/<nav aria-label="Status"/)
    expect(html).toMatch(/aria-current="page"[^>]*>Open<span[^>]*>\d+<\/span>/)
    expect(html).toContain('Cleared by a later import')
    expect(html).not.toContain('resolved by rerun')
    expect(html).not.toContain('<select')
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).not.toContain('owner changed')
  })

  it('offers no bulk accept on the accepted tab', async () => {
    await actAs('staff')
    expect(await exceptionsHtml({ status: 'accepted' })).not.toContain('Accept all owner changes')
  })
})

describe('imports page', () => {
  it('opens each run from its start time without a separate report column', async () => {
    await actAs('staff')
    const run = await handle.db.query.importRuns.findFirst()
    const html = renderToStaticMarkup(await ImportsPage({ searchParams: Promise.resolve({}) }))
    expect(html).toMatch(new RegExp(`<a [^>]*href="/staff/gis/imports/${run?.id}"[^>]*>[A-Z]`))
    expect(html).not.toMatch(/>Report</)
    expect(html).toContain('Newest first')
  })
})

describe('import run page', () => {
  it('names the layer in the title and links back to imports', async () => {
    await actAs('staff')
    const run = await handle.db.query.importRuns.findFirst({
      where: (r, { eq }) => eq(r.layerKey, 'cama'),
    })
    const html = renderToStaticMarkup(
      await RunPage({ params: Promise.resolve({ runId: run?.id ?? '' }) }),
    )
    expect(html).toMatch(/<h1>CAMA owner data import, [A-Z][a-z]+ \d+, \d{4}/)
    expect(html).toMatch(/<a [^>]*href="\/staff\/gis\/imports"[^>]*>Imports<\/a>/)
  })
})
