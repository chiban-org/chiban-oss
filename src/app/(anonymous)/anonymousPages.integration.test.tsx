import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { openAnonymousIntake } from '@/test/anonymousFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findUuids, visibleText } from '@/test/leaks'
import { seedParcelWorld } from '@/test/parcels'

const state = vi.hoisted((): { db: unknown } => ({ db: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/config/appVersion', () => ({ APP_VERSION: '0.0.0' }))
vi.mock('next/navigation', () => ({ usePathname: () => '/report-anonymously' }))

const { default: ReportPage } = await import('@/app/(anonymous)/report-anonymously/page')
const { default: ReceivedPage } = await import('@/app/(anonymous)/report-anonymously/received/page')
const { generateMetadata: anonymousMetadata, dynamic: anonymousRendering } = await import(
  '@/app/(anonymous)/layout'
)

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

const render = async (element: Promise<unknown>) => renderToStaticMarkup((await element) as never)

describe('anonymous pages', () => {
  it('render per request, so building the image needs no database for the town name', () => {
    expect(anonymousRendering).toBe('force-dynamic')
  })

  it('declare an inline icon so the browser never asks for /favicon.ico', async () => {
    const metadata = await anonymousMetadata()
    expect(metadata.icons).toEqual({ icon: 'data:,' })
    expect(metadata.referrer).toBe('no-referrer')
  })

  it('name the town in the tab title', async () => {
    const metadata = await anonymousMetadata()
    expect(metadata.title).toEqual({
      default: 'Town of Alder Pond',
      template: '%s · Town of Alder Pond',
    })
  })

  it('carries the town header, footer and skip link, with a way home, without reading any session', async () => {
    const { default: AnonymousLayout } = await import('@/app/(anonymous)/layout')
    const markup = renderToStaticMarkup(await AnonymousLayout({ children: null }))
    expect(markup).toMatch(/<header[\s\S]*<a href="\/"[^>]*>[\s\S]*Town of Alder Pond[\s\S]*<\/a>/)
    expect(markup).toMatch(/<a href="#content"[^>]*>Skip to content<\/a>/)
    expect(markup).toMatch(/<main id="content"/)
    expect(markup).toMatch(/<footer[\s\S]*Town of Alder Pond[\s\S]*<\/footer>/)
    expect(markup).not.toContain('Sign in')
    expect(markup).not.toContain('aria-label="Account"')
  })

  it('say the form is not available while intake is closed', async () => {
    const page = visibleText(await render(ReportPage({ searchParams: Promise.resolve({}) })))
    expect(page).toContain('Anonymous reports are not available')
    expect(page).not.toContain('Send report')
    const markup = await render(ReportPage({ searchParams: Promise.resolve({}) }))
    expect(markup).toMatch(/<a [^>]*href="\/complaints\/new"[^>]*>report a possible violation<\/a>/)
  })

  it('show the exact warning copy and a plain multipart form once intake is open', async () => {
    await openAnonymousIntake(handle.db)
    const markup = await render(ReportPage({ searchParams: Promise.resolve({}) }))
    const text = visibleText(markup)
    expect(text).toContain('Report a possible violation anonymously')
    expect(text).toContain(
      'Anything you type or attach may identify you. Leave out your name, your address, and details only you would know. Photos are stripped of location and camera data before they are saved.',
    )
    expect(markup).toContain('action="/intake/anonymous"')
    expect(markup).toMatch(/enc[tT]ype="multipart\/form-data"/)
    expect(markup).toContain('method="post"')
    expect(markup).not.toContain('csrf')
    expect(markup).not.toContain('<script')
    expect(markup).not.toContain('role="alert"')
  })

  it('shows why a report was sent back above the form', async () => {
    await openAnonymousIntake(handle.db)
    const markup = await render(ReportPage({ searchParams: Promise.resolve({ error: 'invalid' }) }))
    const alert = /<p[^>]*role="alert"[^>]*>([\s\S]*?)<\/p>/.exec(markup)?.[1] ?? ''
    expect(visibleText(alert)).toContain('Your report was not sent.')
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf('<form'))
  })

  it('ignores an error code it does not know', async () => {
    await openAnonymousIntake(handle.db)
    const markup = await render(
      ReportPage({ searchParams: Promise.resolve({ error: '<b>made up</b>' }) }),
    )
    expect(markup).not.toContain('role="alert"')
    expect(markup).not.toContain('made up')
  })

  it('the received page shows the exact copy with a valid reference', async () => {
    const page = visibleText(
      await render(ReceivedPage({ searchParams: Promise.resolve({ ref: 'CP-2027-0001' }) })),
    )
    expect(page).toContain('Report received')
    expect(page).toMatch(/Your reference\s+CP-2027-0001/)
    expect(page).toContain('The town does not know who sent it, so it cannot reply to you.')
    expect(findIsoDates(page)).toEqual([])
    expect(findUuids(page)).toEqual([])
  })

  it('the received page ignores a reference that is not a complaint number', async () => {
    const page = visibleText(
      await render(ReceivedPage({ searchParams: Promise.resolve({ ref: '<b>x</b>' }) })),
    )
    expect(page).toContain('The town does not know who sent it')
    expect(page).not.toContain('Your reference')
    expect(page).not.toContain('<b>')
  })
})
