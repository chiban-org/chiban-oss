import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  agendas,
  applications,
  boardDecisions,
  boardMeetings,
  boardPackets,
  hearings,
} from '@/db/schema'
import { createMeetingPacket } from '@/features/agendas/meetingPacket'
import { loadActor } from '@/features/auth/actor'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates } from '@/test/leaks'
import { makeTestStore } from '@/test/minio'

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
  usePathname: () => '/staff/boards',
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: MeetingPage } = await import(
  '@/app/(staff)/staff/boards/meetings/[meetingId]/page'
)
const { default: HearingPage } = await import(
  '@/app/(staff)/staff/boards/hearings/[hearingId]/page'
)
const { default: DecisionPage } = await import(
  '@/app/(staff)/staff/boards/decisions/[decisionId]/page'
)

const signal = new AbortController().signal
let handle: TestDb

async function actAs(email: string): Promise<void> {
  const user = await handle.db.query.users.findFirst({
    where: (u, { eq: equals }) => equals(u.email, `${email}@alderpond.example`),
  })
  state.actor = await loadActor(handle.db, user?.id ?? '', signal)
}

function markup(element: unknown): string {
  return renderToStaticMarkup(element as never)
}

function text(html: string): string {
  return html.replaceAll(/<[^>]*>/g, ' ').replaceAll(/\s+/g, ' ')
}

async function hearingOf(number: string, status: string): Promise<string> {
  const rows = await handle.db
    .select({ id: hearings.id, status: hearings.status })
    .from(hearings)
    .innerJoin(applications, eq(applications.id, hearings.applicationId))
    .where(eq(applications.number, number))
  return rows.find((r) => r.status === status)?.id ?? ''
}

async function decisionOf(number: string): Promise<string> {
  const [row] = await handle.db
    .select({ id: boardDecisions.id })
    .from(boardDecisions)
    .innerJoin(applications, eq(applications.id, boardDecisions.applicationId))
    .where(eq(applications.number, number))
  return row?.id ?? ''
}

async function publishedMeeting(): Promise<string> {
  const [row] = await handle.db
    .select({ id: boardMeetings.id })
    .from(agendas)
    .innerJoin(boardMeetings, eq(boardMeetings.id, agendas.meetingId))
    .where(eq(agendas.status, 'published'))
  return row?.id ?? ''
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
})
afterAll(async () => {
  await handle.drop()
})

describe('meeting page', () => {
  it('shows the packet section, jumps to it from the rail, and creates nothing by rendering', async () => {
    await actAs('staff')
    const meetingId = await publishedMeeting()
    const packetsBefore = await handle.db.select().from(boardPackets)
    const html = markup(await MeetingPage({ params: Promise.resolve({ meetingId }) }))
    expect(html).toContain('class="record-layout')
    expect(html).toContain('id="packet"')
    expect(text(html)).toContain('Gather')
    expect(text(html)).toContain('Not sent yet')
    expect(html).toContain('href="#packet"')
    expect(text(html)).toContain('Prepare the packet')
    expect(text(html)).not.toContain('Create the meeting packet')
    expect(await handle.db.select().from(boardPackets)).toHaveLength(packetsBefore.length)
    const { store } = await makeTestStore()
    const staff = state.actor as Parameters<typeof createMeetingPacket>[2]
    const made = await createMeetingPacket(handle.db, store, staff, meetingId, signal)
    if (!made.ok) throw new Error(JSON.stringify(made.error))
    const after = markup(await MeetingPage({ params: Promise.resolve({ meetingId }) }))
    expect(text(after)).toContain('Save title')
    expect(text(after)).toMatch(/Send to the .+ \(\d+ members\)/)
  })
})

describe('hearing page', () => {
  it('puts status and the next step in the rail and the notice table in a panel', async () => {
    await actAs('staff')
    const hearingId = await hearingOf('VAR-2026-0003', 'scheduled')
    const html = markup(await HearingPage({ params: Promise.resolve({ hearingId }) }))
    expect(html).toContain('class="record-layout')
    expect(html).toMatch(/<div class="table-panel[^"]*"><table/)
    const body = text(html)
    expect(body).toMatch(/\d+ notices? still needs? proof/)
    expect(body).not.toContain('Mark properly noticed')
    expect(findIsoDates(body)).toEqual([])
  })

  it('links a continued hearing both ways', async () => {
    await actAs('staff')
    const earlier = await hearingOf('VAR-2026-0003', 'continued')
    const later = await hearingOf('VAR-2026-0003', 'scheduled')
    const from = markup(await HearingPage({ params: Promise.resolve({ hearingId: later }) }))
    expect(from).toContain(`href="/staff/boards/hearings/${earlier}"`)
    expect(text(from)).toContain('Continued from the November 17, 2026 hearing')
    const to = markup(await HearingPage({ params: Promise.resolve({ hearingId: earlier }) }))
    expect(to).toContain(`href="/staff/boards/hearings/${later}"`)
    expect(text(to)).toContain('Continued to the December 15, 2026 hearing')
  })

  it('folds a fully proved notice list to one line', async () => {
    await actAs('staff')
    const hearingId = await hearingOf('SPR-2026-0002', 'held')
    const body = text(markup(await HearingPage({ params: Promise.resolve({ hearingId }) })))
    expect(body).toMatch(/All \d+ notices proved on time, marked noticed [A-Z][a-z]+ \d+, \d{4}/)
  })
})

describe('decision page', () => {
  it('marks an overdue filing deadline and lists sections in the index order', async () => {
    await actAs('staff')
    const decisionId = await decisionOf('VAR-2026-0004')
    const html = markup(await DecisionPage({ params: Promise.resolve({ decisionId }) }))
    expect(html).toContain('class="record-layout')
    const body = text(html)
    expect(body).toContain('October 27, 2026 (overdue)')
    expect(body).toContain('Create the Notice of Decision before filing')
    expect(findIsoDates(body)).toEqual([])
  })

  it('puts the transmittal checklist in a scrolling panel', async () => {
    await actAs('staff')
    const decisionId = await decisionOf('SPR-2026-0002')
    const html = markup(await DecisionPage({ params: Promise.resolve({ decisionId }) }))
    expect(html).toMatch(/<div class="table-panel[^"]*"><table/)
  })
})
