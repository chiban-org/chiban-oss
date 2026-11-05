import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildAgenda, publishAgenda } from '@/features/agendas/agendas'
import { createMeetingPacket } from '@/features/agendas/meetingPacket'
import type { Actor } from '@/features/auth/actor'
import { loadActor } from '@/features/auth/actor'
import { inviteBoardMember } from '@/features/boards/members'
import { sendPacketToBoard } from '@/features/boards/packetSend'
import { scheduleHearing } from '@/features/hearings/hearings'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findUuids } from '@/test/leaks'
import { makeTestStore } from '@/test/minio'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
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
let versionId = ''

async function member(email: string, board: 'planning_board' | 'zba'): Promise<Actor> {
  const invited = await inviteBoardMember(
    handle.db,
    createMemoryTransport(),
    world.staff,
    { email, displayName: 'Member', board, title: 'member', termStart: '2020-01-01' as CivilDate },
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
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  const { store } = await makeTestStore()
  state.store = store
  zba = await member('zba.member@alderpond.example', 'zba')
  pb = await member('pb.member@alderpond.example', 'planning_board')
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id)
  await issueListWithRecipients(handle.db, world, id, [recipient(1)])
  const meeting = (
    await handle.db.query.boardMeetings.findMany({
      where: (m, { eq }) => eq(m.board, 'zba'),
    })
  )[0]
  meetingId = meeting?.id ?? ''
  await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId: id, meetingId, kind: 'public_hearing' },
    signal,
  )
  await buildAgenda(handle.db, world.staff, meetingId, signal)
  await publishAgenda(handle.db, store, world.staff, meetingId, signal)
  const packet = await createMeetingPacket(handle.db, store, world.staff, meetingId, signal)
  if (!packet.ok) throw new Error('packet')
  await sendPacketToBoard(
    handle.db,
    createMemoryTransport(),
    world.staff,
    { packetId: packet.value.packetId },
    signal,
  )
  const [item] = await handle.db.query.boardPacketItems.findMany({
    where: (i, { eq }) => eq(i.packetId, packet.value.packetId),
  })
  versionId = item?.versionId ?? ''
})
afterAll(async () => {
  await handle.drop()
})

describe('board member home', () => {
  it('sends a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(BoardHomePage()).rejects.toThrow('NEXT_REDIRECT:/sign-in?next=%2Fboard')
  })

  it('shows the permission copy to a signed-in person without a board account', async () => {
    state.actor = world.applicant
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html).toContain('You do not have permission to read board packets.')
    expect(html).not.toContain('Open the packet')
  })

  it('lists the zba member their own meeting with human labels', async () => {
    state.actor = zba
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html).toContain('Zoning Board of Adjustment, April 15, 2027')
    expect(html).toContain(`/board/meetings/${meetingId}`)
    expect(findIsoDates(html.replace(/href="[^"]*"/g, ''))).toEqual([])
  })

  it('shows the planning board member an empty list', async () => {
    state.actor = pb
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html).toContain('No meeting packets are ready for you yet.')
  })

  it('uses no text smaller than 16px', async () => {
    state.actor = zba
    const html = renderToStaticMarkup(await BoardHomePage())
    expect(html).not.toMatch(/text-(xs|sm)\b/)
  })
})

describe('board member meeting page', () => {
  it('opens the packet for a member of that board', async () => {
    state.actor = zba
    const html = renderToStaticMarkup(await MeetingPage({ params: Promise.resolve({ meetingId }) }))
    expect(html).toContain('Zoning Board of Adjustment packet, April 15, 2027')
    expect(html).toContain(`/documents/${versionId}`)
    expect(findUuids(html.replace(/href="[^"]*"/g, ''))).toEqual([])
    expect(html).not.toMatch(/\.pdf\)/)
  })

  it('is not found for a member of the other board', async () => {
    state.actor = pb
    await expect(MeetingPage({ params: Promise.resolve({ meetingId }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
  })

  it('is not found for someone who is not a member and for a malformed id', async () => {
    state.actor = world.applicant
    await expect(MeetingPage({ params: Promise.resolve({ meetingId }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    state.actor = zba
    await expect(MeetingPage({ params: Promise.resolve({ meetingId: 'nope' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
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

  it('answers 401 when signed out and 404 for the other board and unknown versions', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call(pb)).status).toBe(404)
    expect((await call(zba, '00000000-0000-4000-8000-000000000000')).status).toBe(404)
    expect((await call(zba, 'nope')).status).toBe(404)
  })
})
