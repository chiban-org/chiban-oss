import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { scheduleHearing } from '@/features/hearings/hearings'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { sectionOf } from '@/test/htmlSections'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'

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
let world: BoardWorld
let applicationId = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  state.actor = world.staff
  applicationId = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, applicationId)
  await issueListWithRecipients(handle.db, world, applicationId, [recipient(1)])
  const [meeting] = await handle.db.query.boardMeetings.findMany({
    where: (m, { eq }) => eq(m.meetingDate, '2027-04-15'),
  })
  const scheduled = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId, meetingId: meeting?.id ?? '', kind: 'public_hearing' },
    signal,
  )
  expect(scheduled.ok).toBe(true)
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(async () => {
  await handle.drop()
})

async function pageOn(instant: string): Promise<string> {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(instant))
  return renderToStaticMarkup(
    (await ApplicationPage({ params: Promise.resolve({ applicationId }) })) as never,
  )
}

function headerStatus(html: string): string | undefined {
  return /data-status="([a-z]+)"/.exec(html)?.[1]
}

describe('the hearing notice deadline on the record', () => {
  it('names a missed notice deadline as what makes the record overdue', async () => {
    const html = await pageOn('2027-04-12T16:00:00Z')
    const clocks = sectionOf(html, 'Clocks') ?? ''
    expect(clocks).toContain('Notice for the hearing on April 15, 2027')
    expect(clocks).toContain('Due April 10, 2027')
    expect(clocks).toContain('Overdue by 2 days')
    expect(clocks).toContain('/staff/boards/hearings/')
    expect(headerStatus(html)).toBe('overdue')
    expect(sectionOf(html, 'Deadlines') ?? '').toContain('Notice overdue, due April 10, 2027')
  })

  it('shows the notice deadline as running before it passes', async () => {
    const html = await pageOn('2027-04-08T16:00:00Z')
    const clocks = sectionOf(html, 'Clocks') ?? ''
    expect(clocks).toContain('Notice for the hearing on April 15, 2027')
    expect(clocks).toContain('2 days remaining')
    expect(headerStatus(html)).not.toBe('overdue')
  })
})
