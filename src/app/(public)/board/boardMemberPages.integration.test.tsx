import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { agendas, boardDecisions, boardMeetings, hearings } from '@/db/schema'
import { buildAgenda, publishAgenda } from '@/features/agendas/agendas'
import { createMeetingPacket } from '@/features/agendas/meetingPacket'
import type { Actor } from '@/features/auth/actor'
import { loadActor } from '@/features/auth/actor'
import { inviteBoardMember } from '@/features/boards/members'
import { recordMinutes } from '@/features/boards/minutes'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { setAudiences } from '@/features/documents/publish'
import { scheduleHearing } from '@/features/hearings/hearings'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import {
  type BoardWorld,
  boardIdOf,
  boardIdSql,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { findIsoDates, findUuids } from '@/test/leaks'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

interface MockState {
  db: unknown
  actor: Actor | null
  store: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null, store: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/features/storage/objectStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/storage/objectStore')>()),
  getObjectStore: () => state.store,
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { default: BoardHomePage } = await import('./page')
const { default: MeetingPage } = await import('./meetings/[meetingId]/page')
const { GET } = await import('./meetings/[meetingId]/documents/[versionId]/route')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let zba: Actor
let pb: Actor
let meetingId = ''
let laterMeetingId = ''
let versionId = ''
let applicationId = ''
let minutesDoc = ''
let decisionDoc = ''
let agendaDoc = ''

const WHEN = 'Thursday, April 15, 2027 at 7:00 PM, Alder Pond Town Hall, Meeting Room 2'

async function member(email: string, board: 'planning_board' | 'zba'): Promise<Actor> {
  const boardId = await boardIdOf(handle.db, board)
  const invited = await inviteBoardMember(
    handle.db,
    createMemoryTransport(),
    world.staff,
    {
      email,
      displayName: 'Member',
      boardId,
      title: 'member',
      termStart: '2020-01-01' as CivilDate,
    },
    signal,
  )
  if (!invited.ok) throw new Error(invited.error)
  const actor = await loadActor(handle.db, invited.value.userId, signal)
  if (actor === null) throw new Error('no actor')
  return actor
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15', '2027-05-20'] })
  const { store } = await makeTestStore()
  state.store = store
  zba = await member('zba.member@alderpond.example', 'zba')
  pb = await member('pb.member@alderpond.example', 'planning_board')
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  applicationId = id
  await recordNoRegionalImpact(handle.db, world, id)
  await issueListWithRecipients(handle.db, world, id, [recipient(1)])
  const meetings = await handle.db.query.boardMeetings.findMany({
    where: (m, { eq: same }) => same(m.boardId, boardIdSql('zba')),
    orderBy: (m, { asc }) => asc(m.meetingDate),
  })
  meetingId = meetings[0]?.id ?? ''
  laterMeetingId = meetings[1]?.id ?? ''
  await handle.db
    .update(boardMeetings)
    .set({ location: 'Alder Pond Town Hall, Meeting Room 2' })
    .where(eq(boardMeetings.id, meetingId))
  await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId: id, meetingId, kind: 'public_hearing' },
    signal,
  )
  await buildAgenda(handle.db, world.staff, meetingId, signal)
  await publishAgenda(handle.db, store, world.staff, meetingId, signal)
  const plan = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'application', id },
    pdfBytes('plan'),
    { title: 'Variance site plan' },
  )
  await setAudiences(
    handle.db,
    world.staff,
    { documentId: plan.documentId, audiences: ['board'] },
    signal,
  )
  const packet = await createMeetingPacket(handle.db, store, world.staff, meetingId, signal)
  if (!packet.ok) throw new Error('packet')
  await sendPacketToBoard(
    handle.db,
    createMemoryTransport(),
    world.staff,
    { packetId: packet.value.packetId },
    signal,
  )
  const items = await handle.db.query.boardPacketItems.findMany({
    where: (i, { eq: same }) => same(i.packetId, packet.value.packetId),
  })
  versionId = items.find((i) => i.documentId === plan.documentId)?.versionId ?? ''
  await laterAgendaOnly(store)
  await earlierRecords(store)
})

async function laterAgendaOnly(store: Awaited<ReturnType<typeof makeTestStore>>['store']) {
  const other = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-04-01')
  await recordNoRegionalImpact(handle.db, world, other)
  await issueListWithRecipients(handle.db, world, other, [recipient(2)])
  await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId: other, meetingId: laterMeetingId, kind: 'public_hearing' },
    signal,
  )
  await buildAgenda(handle.db, world.staff, laterMeetingId, signal)
  await publishAgenda(handle.db, store, world.staff, laterMeetingId, signal)
  const [agenda] = await handle.db
    .select()
    .from(agendas)
    .where(eq(agendas.meetingId, laterMeetingId))
  agendaDoc = agenda?.documentId ?? ''
}

async function earlierRecords(store: Awaited<ReturnType<typeof makeTestStore>>['store']) {
  const minutes = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'meeting', id: meetingId },
    pdfBytes('minutes'),
    { title: 'Minutes' },
  )
  minutesDoc = minutes.documentId
  const recorded = await recordMinutes(
    handle.db,
    world.staff,
    {
      meetingId,
      documentId: minutesDoc,
      status: 'approved',
      approvedOn: '2027-04-20' as CivilDate,
    },
    signal,
    new Date('2027-04-21T12:00:00Z'),
  )
  if (!recorded.ok) throw new Error(recorded.error)
  const decision = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'application', id: applicationId },
    pdfBytes('decision'),
    { title: 'Notice of Decision' },
  )
  decisionDoc = decision.documentId
  await setAudiences(
    handle.db,
    world.staff,
    { documentId: decisionDoc, audiences: ['board'] },
    signal,
  )
  const [hearing] = await handle.db
    .select()
    .from(hearings)
    .where(eq(hearings.applicationId, applicationId))
  await handle.db.insert(boardDecisions).values({
    applicationId,
    hearingId: hearing?.id ?? '',
    meetingId,
    votedOn: '2027-04-15',
    outcome: 'approved',
    motion: 'Grant the variance',
    votes: { for: 3, against: 0, abstain: 0, members: [] },
    findings: 'Meets the criteria',
    conditions: [],
    filedOn: '2027-04-19',
    writtenDecisionDocumentId: decisionDoc,
    recordedBy: world.staff.userId,
  })
}
afterAll(async () => {
  await handle.drop()
})

describe('board member home', () => {
  it('sends a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(BoardHomePage()).rejects.toThrow('NEXT_REDIRECT:/sign-in?next=%2Fboard')
  })

  it('refuses a signed-in person without a board seat with the shared refusal', async () => {
    state.actor = world.applicant
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html).toContain('<h1>Your board</h1>')
    expect(html).toContain('You do not have permission to read board packets.')
    expect(html).not.toContain('href="/staff"')
    expect(html).not.toContain('Open the packet')
  })

  it('lists the zba member their own meeting with when and where', async () => {
    state.actor = zba
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html).toContain('<h1>Your board</h1>')
    expect(html).toContain(WHEN)
    expect(html).toContain(`/board/meetings/${meetingId}`)
    expect(html).toMatch(/<mark[^>]*>New<\/mark>/)
    expect(findIsoDates(html.replace(/href="[^"]*"/g, ''))).toEqual([])
  })

  it('puts the next meeting first, and links the agenda of a later one with no packet yet', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-01T12:00:00Z') })
    try {
      state.actor = zba
      const html = renderToStaticMarkup(await BoardHomePage())
      const next = html.slice(
        html.indexOf('>Next meeting</h2>'),
        html.indexOf('>Later meetings</h2>'),
      )
      expect(next).toContain(WHEN)
      expect(next).toContain(`/board/meetings/${meetingId}`)
      const later = html.slice(html.indexOf('>Later meetings</h2>'))
      expect(later).toContain('Thursday, May 20, 2027 at 7:00 PM')
      expect(later).toContain(`/api/documents/${agendaDoc}`)
      expect(later).toContain('Read the agenda')
      expect(later).toContain('(opens in a new tab)')
      expect(html).not.toContain('The packet is not ready yet.')
      expect(html).not.toContain('Earlier meetings')
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves a meeting that has passed under Earlier meetings, with its minutes and decision', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-06-01T12:00:00Z') })
    try {
      state.actor = zba
      const html = renderToStaticMarkup(await BoardHomePage())
      expect(html).toContain('No meeting of your board is coming up.')
      const earlier = html.slice(html.indexOf('>Earlier meetings</h2>'))
      expect(earlier).toContain('Thursday, April 15, 2027')
      expect(earlier).toContain(`/api/documents/${minutesDoc}`)
      expect(earlier).toContain('Minutes, approved April 20, 2027')
      expect(earlier).toContain(`/api/documents/${decisionDoc}`)
      expect(earlier).toMatch(/Notice of Decision, [^<]*: Approved/)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the planning board member an empty list', async () => {
    state.actor = pb
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html).toContain('No meeting packets are ready for you yet.')
  })

  it('uses no text smaller than 16px outside the shared chip', async () => {
    state.actor = zba
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html.replace(/<span data-status[\s\S]*?<\/span>/g, '')).not.toMatch(/text-(xs|sm)\b/)
  })
})

describe('board member meeting page', () => {
  it('opens the packet for a member of that board, grouped by agenda item, in a panel', async () => {
    state.actor = zba
    const html = renderToStaticMarkup(await MeetingPage({ params: Promise.resolve({ meetingId }) }))
    expect(html).toContain('<h1>Zoning Board of Adjustment packet</h1>')
    expect(html).toContain(WHEN)
    expect(html).not.toContain('Alder Pond Zoning Board of Adjustment')
    expect(html).toContain('>Your board</a>')
    expect(html).toMatch(/<section[^>]*aria-label="In this packet"/)
    expect(html).toContain('Documents open in a new tab.')
    const cover = html.indexOf('>Cover and agenda</h3>')
    const item = html.search(/>Item 1\. Public hearing: [^<]+<\/h3>/)
    expect(cover).toBeGreaterThan(-1)
    expect(item).toBeGreaterThan(cover)
    expect(versionId).not.toBe('')
    expect(html.slice(item)).toContain(`/documents/${versionId}`)
    expect(html.slice(item)).toContain('Variance site plan')
    expect(html).toContain(`/board/meetings/${meetingId}/documents/cover`)
    expect(findUuids(html.replace(/href="[^"]*"/g, ''))).toEqual([])
    expect(html).not.toMatch(/\.pdf\)/)
  })

  it('is not found for a member of the other board and for a malformed id', async () => {
    state.actor = pb
    await expect(MeetingPage({ params: Promise.resolve({ meetingId }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    state.actor = zba
    await expect(MeetingPage({ params: Promise.resolve({ meetingId: 'nope' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })

  it('refuses someone with no board seat without saying whether the meeting exists', async () => {
    state.actor = world.applicant
    for (const id of [meetingId, 'nope']) {
      const html = renderToStaticMarkup(
        await MeetingPage({ params: Promise.resolve({ meetingId: id }) }),
      )
      expect(html).toContain('You do not have permission to read board packets.')
      expect(html).not.toContain('Zoning Board of Adjustment')
    }
  })
})

describe('board member document route', () => {
  const call = (actor: Actor | null, version = versionId) => {
    state.actor = actor
    return GET(new Request('http://localhost/x'), {
      params: Promise.resolve({ meetingId, versionId: version }),
    })
  }

  it('streams the stored file to a member under a sandbox policy', async () => {
    const response = await call(zba)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('serves the cover page to a member and not to the other board', async () => {
    const response = await call(zba, 'cover')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('pdf')
    expect((await call(pb, 'cover')).status).toBe(404)
  })

  it('answers 401 when signed out and 404 for the other board and unknown versions', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call(pb)).status).toBe(404)
    expect((await call(zba, '00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect((await call(zba, 'nope')).status).toBe(404)
  })
})
