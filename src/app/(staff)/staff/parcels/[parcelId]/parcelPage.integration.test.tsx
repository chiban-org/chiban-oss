import { sql } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { importExceptions, importRuns } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'
import { visibleText } from '@/test/leaks'

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
  usePathname: () => '/staff/parcels',
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ParcelPage } = await import('@/app/(staff)/staff/parcels/[parcelId]/page')
const { default: ExceptionsPage } = await import('@/app/(staff)/staff/gis/exceptions/page')

const signal = new AbortController().signal
let handle: TestDb
const lots = { busy: '', empty: '', decided: '', inspected: '' }
let inspectionType = ''

async function actAs(local: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, `${local}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

async function page(parcelId: string): Promise<string> {
  return renderToStaticMarkup(
    await ParcelPage({
      params: Promise.resolve({ parcelId }),
      searchParams: Promise.resolve({}),
    }),
  )
}

async function first<T>(query: ReturnType<typeof sql>): Promise<T> {
  const result = await handle.db.execute(query)
  const row = result.rows[0]
  if (row === undefined) throw new Error('the demo data has no such parcel')
  return row as T
}

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
  lots.busy = (
    await first<{ id: string }>(sql`select id from parcels where site_address = '34 Scenario Lane'`)
  ).id
  lots.empty = (
    await first<{ id: string }>(sql`select p.id from parcels p
      where p.site_address is not null and p.status = 'active'
        and not exists (select 1 from parcel_record_links l where l.parcel_id = p.id)
        and not exists (select 1 from projects pr where pr.parcel_id = p.id)
      order by p.site_address limit 1`)
  ).id
  lots.decided = (
    await first<{ id: string }>(sql`select pr.parcel_id as id from board_decisions d
      join applications a on a.id = d.application_id
      join projects pr on pr.id = a.project_id
      where a.state = 'decided' and d.outcome in ('approved', 'approved_with_conditions')
      limit 1`)
  ).id
  const inspected = await first<{ id: string; type: string }>(sql`select l.parcel_id as id,
      i.inspection_type as type from inspections i
      join parcel_record_links l on l.record_kind = 'inspection' and l.record_id = i.id
      where i.status = 'scheduled' and l.status = 'linked' limit 1`)
  lots.inspected = inspected.id
  inspectionType = inspected.type
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('the staff parcel page for office staff', () => {
  it('leads with the address, the open-now sentence and what is open on the lot', async () => {
    for (const who of ['staff', 'admin']) {
      await actAs(who)
      const html = await page(lots.busy)
      expect(html).toMatch(/<h1[^>]*>34 Scenario Lane<\/h1>/)
      expect(visibleText(html)).toContain('Map-lot ID')
      expect(html).toContain('data-parcel-view="office"')
      const sentence = /data-slot="open-now"[^>]*>([^<]*)</.exec(html)?.[1] ?? ''
      expect(sentence).toMatch(/^(Open: .+\.|Nothing open on this lot\.)$/)
      expect(html).toContain('data-slot="open-now-strip"')
      expect(html.indexOf('id="open-heading"')).toBeLessThan(html.indexOf('id="records-heading"'))
    }
  })

  it('has no filled button and keeps lineage in a quiet More actions disclosure', async () => {
    await actAs('staff')
    const html = await page(lots.busy)
    expect(html).not.toContain('data-variant="default"')
    expect(html).toContain('data-slot="more-actions"')
    expect(visibleText(html)).toContain('Record lineage event')
  })

  it('links the owner to a parcel search and the exceptions to this parcel', async () => {
    await actAs('staff')
    const html = await page(lots.busy)
    expect(html).toMatch(/href="\/staff\/parcels\?q=[^"]+"/)
    expect(visibleText(html)).toContain('Notices go to')
    const [run] = await handle.db
      .insert(importRuns)
      .values({ layerKey: 'parcels', adapter: 'file_geojson', inputHash: 'p', status: 'succeeded' })
      .returning({ id: importRuns.id })
    await handle.db.insert(importExceptions).values({
      layerKey: 'parcels',
      firstRunId: run?.id ?? '',
      lastSeenRunId: run?.id ?? '',
      rowKey: 'id:parcel-page-test',
      kind: 'invalid_geometry',
      contentHash: 'parcel-page-test',
      payload: { parcelId: lots.busy },
      detail: 'Test exception',
    })
    expect(await page(lots.busy)).toContain(`href="/staff/gis/exceptions?parcel=${lots.busy}"`)
  })

  it('lists the nearby parcels as links for keyboard users', async () => {
    await actAs('staff')
    const html = await page(lots.busy)
    expect(html).toContain('id="nearby-heading"')
    expect(html).toMatch(/<a[^>]*href="\/staff\/parcels\/[0-9a-f-]{36}"[^>]*>32 Scenario Lane<\/a>/)
  })

  it('folds IDs and lineage into Record and history', async () => {
    await actAs('staff')
    const html = await page(lots.busy)
    const fold = html.slice(html.indexOf('data-history-group'))
    expect(fold).toContain('Override an ID')
    expect(html.indexOf('Override an ID')).toBeGreaterThan(html.indexOf('data-history-group'))
  })

  it('says nothing is open on an empty lot', async () => {
    await actAs('staff')
    const html = await page(lots.empty)
    expect(html).toContain('Nothing open on this lot.')
  })

  it('shows decisions in force with their outcome', async () => {
    await actAs('staff')
    const html = await page(lots.decided)
    expect(html).toContain('Conditions and decisions in force')
    expect(visibleText(html)).toMatch(/Granted|Approved/)
    expect(visibleText(html)).not.toMatch(/>Decided</)
  })

  it('names inspection rows by their type and dates them by their schedule', async () => {
    await actAs('staff')
    const html = await page(lots.inspected)
    const words = inspectionType.replace(/[_-]+/g, ' ').trim()
    expect(visibleText(html).toLowerCase()).toContain(`${words} inspection`.toLowerCase())
    expect(visibleText(html)).toMatch(/Scheduled [A-Z][a-z]{2} \d{1,2}, \d{4}/)
  })
})

describe('the staff parcel page for other roles', () => {
  it('gives the building official the full page with the next inspection in the open panel', async () => {
    await actAs('official')
    const html = await page(lots.inspected)
    expect(html).toContain('data-parcel-view="office"')
    expect(html).toContain('data-slot="next-inspection"')
    expect(visibleText(html)).toMatch(/Record the result|Open the inspection/)
  })

  it('gives finance the page without contacts editing or more actions', async () => {
    await actAs('finance')
    const html = await page(lots.busy)
    expect(html).toContain('data-parcel-view="office"')
    expect(html).not.toContain('data-slot="more-actions"')
    expect(visibleText(html)).toContain('Notices go to')
    expect(visibleText(html)).not.toContain('All notice contacts')
  })

  it('gives a reviewer the page with no links into records they cannot open', async () => {
    await actAs('reviewer')
    const html = await page(lots.decided)
    expect(html).toContain('data-parcel-view="office"')
    expect(html).not.toMatch(/href="\/staff\/applications\//)
    expect(html).not.toContain('data-slot="next-inspection"')
  })
})

describe('the inspector field version', () => {
  it('leads with the next inspection, then cases, conditions and permits in force, then the map', async () => {
    await actAs('inspector')
    const html = await page(lots.inspected)
    expect(html).toContain('data-parcel-view="field"')
    const order = [
      'Next inspection on this lot',
      'Open enforcement cases',
      'Conditions and decisions in force',
      'Permits and approvals in force',
    ].map((heading) => html.indexOf(heading))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(visibleText(html)).toContain('Access notes')
  })

  it('leaves out the office-only panels', async () => {
    await actAs('inspector')
    const html = await page(lots.busy)
    expect(html).not.toContain('Record lineage event')
    expect(html).not.toContain('Override an ID')
    expect(html).not.toContain('Change who can see this')
    expect(html).not.toContain('Add a parcel file')
    expect(html).not.toContain('data-slot="open-now-strip"')
  })
})

describe('import exceptions for one parcel', () => {
  it('says which parcel the list is narrowed to', async () => {
    await actAs('staff')
    const html = renderToStaticMarkup(
      await ExceptionsPage({ searchParams: Promise.resolve({ parcel: lots.busy }) }),
    )
    expect(visibleText(html)).toContain('Showing exceptions on parcel')
    expect(visibleText(html)).toContain('Show exceptions on every parcel')
  })
})
