import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { openAnonymousIntake } from '@/test/anonymousFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findUuids, visibleText } from '@/test/leaks'
import { seedParcelWorld } from '@/test/parcels'

const state = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/config/appVersion', () => ({ APP_VERSION: '0.0.0' }))

const { default: ReportPage } = await import('@/app/(anonymous)/report-anonymously/page')
const { default: ReceivedPage } = await import('@/app/(anonymous)/report-anonymously/received/page')

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
  it('say the form is not available while intake is closed', async () => {
    const page = visibleText(await render(ReportPage()))
    expect(page).toContain('Anonymous reports are not available')
    expect(page).not.toContain('Send report')
  })

  it('show the exact warning copy and a plain multipart form once intake is open', async () => {
    await openAnonymousIntake(handle.db)
    const markup = await render(ReportPage())
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
  })

  it('the received page shows the exact copy with a valid reference', async () => {
    const page = visibleText(
      await render(ReceivedPage({ searchParams: Promise.resolve({ ref: 'CP-2027-0001' }) })),
    )
    expect(page).toContain(
      'Report received. Reference CP-2027-0001. The town does not know who sent it, so it cannot reply to you.',
    )
    expect(findIsoDates(page)).toEqual([])
    expect(findUuids(page)).toEqual([])
  })

  it('the received page ignores a reference that is not a complaint number', async () => {
    const page = visibleText(
      await render(ReceivedPage({ searchParams: Promise.resolve({ ref: '<b>x</b>' }) })),
    )
    expect(page).toContain('Report received. The town does not know who sent it')
    expect(page).not.toContain('<b>')
  })
})
