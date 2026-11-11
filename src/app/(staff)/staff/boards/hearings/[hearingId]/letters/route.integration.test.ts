import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boardMeetings, hearings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { scheduleHearing } from '@/features/hearings/hearings'
import {
  type BoardWorld,
  boardIdSql,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'

const state = vi.hoisted((): { db: unknown; actor: Actor | null } => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const { GET } = await import('./route')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

async function hearingId(): Promise<string> {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id)
  await issueListWithRecipients(handle.db, world, id, [recipient(1)])
  const [meeting] = await handle.db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.meetingDate, '2027-04-15'),
        eq(boardMeetings.boardId, boardIdSql('zba')),
      ),
    )
  const scheduled = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId: id, meetingId: meeting?.id ?? '', kind: 'public_hearing' },
    signal,
  )
  if (!scheduled.ok) throw new Error(JSON.stringify(scheduled.error))
  const [row] = await handle.db.select().from(hearings).where(eq(hearings.applicationId, id))
  return row?.id ?? ''
}

async function open(id: string, actor: Actor, accept = 'text/html'): Promise<Response> {
  state.actor = actor
  return await GET(new Request('http://localhost/x', { headers: { accept } }), {
    params: Promise.resolve({ hearingId: id }),
  })
}

describe('hearing notice letters without a template', () => {
  it('names the template kind and the settings screen, and links there for a settings editor', async () => {
    const id = await hearingId()
    const response = await open(id, world.admin)
    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html).toContain('Hearing notice')
    expect(html).toContain('Settings, Permits, Templates')
    expect(html).toContain('href="/staff/settings/template"')
  })

  it('tells staff who cannot change settings who to ask, without a link', async () => {
    const id = await hearingId()
    const html = await (await open(id, world.staff)).text()
    expect(html).toContain('Settings, Permits, Templates')
    expect(html).toContain('Ask someone who can change settings')
    expect(html).not.toContain('href="/staff/settings/template"')
  })

  it('answers in plain text when the caller does not ask for a page', async () => {
    const id = await hearingId()
    const response = await open(id, world.staff, '*/*')
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toContain('Settings, Permits, Templates')
  })

  it('prints once a hearing notice template is published, even for an application filed before it', async () => {
    const id = await hearingId()
    await saveAndPublish(handle.db, world.admin, 'template', 'hearing-notice', {
      key: 'hearing-notice',
      label: 'Hearing notice',
      kind: 'hearing_notice',
      body: '{{notice.recipientName}}\n\n{{notice.recipientAddress}}',
    })
    const response = await open(id, world.staff)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
  })
})
