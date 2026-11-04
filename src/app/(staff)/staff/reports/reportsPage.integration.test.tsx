import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: ReportsPage } = await import('./page')
const { GET } = await import('./[report]/csv/route')

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.electrical'] })
  await makeApplication(
    handle.db,
    world,
    { receivedDate: '2027-03-03', issuedOn: '2027-03-09' },
    new Date('2027-03-02T15:00:00Z'),
    'EL',
  )
})
afterAll(async () => {
  await handle.drop()
})

const search = { from: '2027-01-01', to: '2027-12-31' }

describe('reports page', () => {
  it('shows volume and processing time with the range in long form and a CSV link each', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await ReportsPage({ searchParams: Promise.resolve(search) }))
    expect(html).toContain('January 1, 2027')
    expect(html).toContain('December 31, 2027')
    expect(html).toContain('March 2027')
    expect(html).toContain('<td>Electrical permit</td>')
    expect(html).not.toContain('<td>EL</td>')
    expect(html).toContain('/staff/reports/permit-volume/csv?from=2027-01-01&amp;to=2027-12-31')
    expect(html).toContain('/staff/reports/processing-time/csv')
    expect(html).toContain('/staff/reports/cash-receipts')
  })

  it('states the default order of each table and lists the other reports once', async () => {
    state.actor = world.staff
    const html = renderToStaticMarkup(await ReportsPage({ searchParams: Promise.resolve(search) }))
    expect(html).toContain(
      'Oldest month first, then by permit type. Click a column heading to sort.',
    )
    expect(html).toContain('By permit type. Click a column heading to sort.')
    expect(html).toContain('Other reports')
    expect(html).toContain('href="/staff/reports/census"')
    expect(html).not.toContain('Open the daily cash receipts report')
    expect(html).not.toContain('Open the Census building permits report')
  })

  it('tells a reviewer they cannot view reports and offers their start page', async () => {
    state.actor = world.reviewer
    const html = renderToStaticMarkup(await ReportsPage({ searchParams: Promise.resolve(search) }))
    expect(html).toContain('You do not have permission to view reports.')
    expect(html).toContain('href="/staff"')
    expect(html).not.toContain('csv?from')
  })

  it('redirects a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(ReportsPage({ searchParams: Promise.resolve(search) })).rejects.toThrow(
      'NEXT_REDIRECT:/staff/sign-in',
    )
  })

  it('serves a CSV to staff, forbids a reviewer and a stranger', async () => {
    state.actor = world.staff
    const ok = await GET(
      new Request(
        'https://alderpond.example/staff/reports/permit-volume/csv?from=2027-01-01&to=2027-12-31',
      ),
      { params: Promise.resolve({ report: 'permit-volume' }) },
    )
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('text/csv')
    expect(await ok.text()).toContain('2027-03,EL,1,1,0,0,0')
    state.actor = world.reviewer
    const denied = await GET(new Request('https://alderpond.example/x'), {
      params: Promise.resolve({ report: 'revenue' }),
    })
    expect(denied.status).toBe(403)
    state.actor = null
    const stranger = await GET(new Request('https://alderpond.example/x'), {
      params: Promise.resolve({ report: 'revenue' }),
    })
    expect(stranger.status).toBe(403)
    state.actor = world.staff
    const unknown = await GET(new Request('https://alderpond.example/x'), {
      params: Promise.resolve({ report: 'nonsense' }),
    })
    expect(unknown.status).toBe(404)
  })

  it('a range over 1827 days is a 422 from the route and a message on the page', async () => {
    state.actor = world.staff
    const long = { from: '2015-01-01', to: '2027-12-31' }
    const res = await GET(
      new Request('https://alderpond.example/x?from=2015-01-01&to=2027-12-31'),
      { params: Promise.resolve({ report: 'permit-volume' }) },
    )
    expect(res.status).toBe(422)
    const html = renderToStaticMarkup(await ReportsPage({ searchParams: Promise.resolve(long) }))
    expect(html).toContain('five years')
  })
})
