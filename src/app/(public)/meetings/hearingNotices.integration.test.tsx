import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadApplicationContext } from '@/features/applications/context'
import { endApplication } from '@/features/portal/endApplication'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { scheduledZbaHearing } from '@/test/hearingFixtures'
import { visibleText } from '@/test/leaks'

const state = vi.hoisted((): { db: unknown } => ({ db: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))

const { default: MeetingsPage } = await import('@/app/(public)/meetings/page')
const { GET } = await import('@/app/(public)/meetings/notices/[hearingId]/route')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let hearingId = ''
let applicationId = ''

async function page(): Promise<string> {
  return renderToStaticMarkup(await MeetingsPage({ searchParams: Promise.resolve({}) }))
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  const hearing = await scheduledZbaHearing(handle.db, world)
  hearingId = hearing.hearingId
  applicationId = hearing.applicationId
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-04-01T16:00:00Z') })
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('hearing notices on the public meetings page', () => {
  it('lists the notice under its own heading with a printable link', async () => {
    const html = await page()
    const text = visibleText(html)
    expect(text).toContain('Hearing notices')
    expect(text).toContain('will hold a Public hearing on April 15, 2027')
    expect(text).toContain('posted on the Town website and bulletin boards')
    expect(text).not.toContain('You are receiving')
    expect(html).toContain(`href="/meetings/notices/${hearingId}"`)
  })

  it('serves the printable notice to an anonymous visitor as a PDF', async () => {
    const res = await GET(new Request(`http://town.test/meetings/notices/${hearingId}`), {
      params: Promise.resolve({ hearingId }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const missing = await GET(new Request('http://town.test/meetings/notices/nope'), {
      params: Promise.resolve({ hearingId: 'nope' }),
    })
    expect(missing.status).toBe(404)
  })

  it('shows a withdrawn line and drops the link once the application is withdrawn', async () => {
    const app = await loadApplicationContext(handle.db, applicationId, signal)
    const ended = await endApplication(
      handle.db,
      world.applicant,
      { applicationId, expectedRowVersion: app?.rowVersion ?? 0, ending: 'withdraw' },
      signal,
    )
    expect(ended.ok).toBe(true)
    const html = await page()
    expect(visibleText(html)).toContain('Withdrawn')
    expect(html).not.toContain(`/meetings/notices/${hearingId}`)
    const res = await GET(new Request('http://town.test/x'), {
      params: Promise.resolve({ hearingId }),
    })
    expect(res.status).toBe(404)
  })

  it('removes the withdrawn line once the original date has passed', async () => {
    vi.setSystemTime(new Date('2027-04-16T16:00:00Z'))
    const text = visibleText(await page())
    expect(text).not.toContain('Withdrawn')
    expect(text).toContain('No hearings are posted right now.')
  })
})
