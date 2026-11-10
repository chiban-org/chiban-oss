import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { publishTownProfileSection } from '@/features/town/profileSettings'
import { storeTownImage } from '@/features/town/townImages'
import { openAnonymousIntake } from '@/test/anonymousFixtures'
import {
  isLogSkipped,
  loggedRequests,
  logSkipPatterns,
  requestedPaths,
} from '@/test/anonymousRequests'
import { makeTestDb, type TestDb } from '@/test/db'
import { pngBytes } from '@/test/frameFixtures'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const state = vi.hoisted((): { db: unknown } => ({ db: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/config/appVersion', () => ({ APP_VERSION: '0.0.0' }))
vi.mock('next/navigation', () => ({ usePathname: () => '/report-anonymously' }))
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }))

const { default: AnonymousLayout, generateMetadata } = await import('@/app/(anonymous)/layout')
const { default: ReportPage } = await import('@/app/(anonymous)/report-anonymously/page')
const { default: ReceivedPage } = await import('@/app/(anonymous)/report-anonymously/received/page')
const { default: GlobalNotFound } = await import('@/app/global-not-found')

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  await openAnonymousIntake(handle.db)
  const { store } = await makeTestStore()
  const seal = await storeTownImage(store, await pngBytes(40, 40), signal)
  if (!seal.ok) throw new Error('seal not stored')
  await publishTownProfileSection(
    handle.db,
    await staffActor(handle.db, 'admin'),
    {
      section: 'profile',
      slice: {
        officeName: 'Land Use Office',
        addressLines: ['1 Main Street'],
        phone: '603-555-0100',
        email: 'landuse@alderpond.example',
        website: '',
        officeHours: '',
        logo: seal.value,
      },
    },
    signal,
  )
})
afterAll(async () => {
  await handle.drop()
})

async function inLayout(page: Promise<unknown>): Promise<string> {
  return renderToStaticMarkup(await AnonymousLayout({ children: (await page) as never }))
}

describe('requests an anonymous page makes', () => {
  it('reads the matcher the access log skips, and finds resource requests in markup', () => {
    const patterns = logSkipPatterns()
    expect(isLogSkipped('/report-anonymously/received', patterns)).toBe(true)
    expect(isLogSkipped('/_next/static/x.css', patterns)).toBe(true)
    expect(isLogSkipped('/town-logo/abc.png', patterns)).toBe(false)
    expect(requestedPaths('<img src="/town-logo/a.png"><a href="/parcels">x</a>')).toEqual([
      '/town-logo/a.png',
    ])
  })

  it.each([
    ['the report form', () => ReportPage({ searchParams: Promise.resolve({}) })],
    ['the report received page', () => ReceivedPage({ searchParams: Promise.resolve({}) })],
  ])('%s requests nothing the access log would record', async (_name, page) => {
    expect(loggedRequests(await inLayout(page()))).toEqual([])
  })

  it('an unknown address under the report path requests nothing the access log would record', async () => {
    expect(loggedRequests(renderToStaticMarkup(await GlobalNotFound()))).toEqual([])
  })

  it('declares no icon the browser would fetch', async () => {
    expect((await generateMetadata()).icons).toEqual({ icon: 'data:,' })
  })
})
