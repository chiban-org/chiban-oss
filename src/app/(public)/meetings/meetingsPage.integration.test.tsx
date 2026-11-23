import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { agendas, boardDecisions, boardMeetings, files } from '@/db/schema'
import { scheduleMeeting } from '@/features/boards/meetings'
import { attachDocument } from '@/features/documents/attach'
import { type BoardWorld, boardIdOf, scheduleMeetings, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { visibleText } from '@/test/leaks'
import { makeTestStore } from '@/test/objectStore'
import { addDays, type CivilDate, todayInTimeZone } from '@/types/civilDate'

const state = vi.hoisted((): { db: unknown } => ({ db: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))

const { default: MeetingsPage } = await import('@/app/(public)/meetings/page')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let applicationId = ''
let parcelHref = ''
let html = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, { pbMeetings: [] })
  const today = todayInTimeZone('America/New_York', new Date())
  const boardId = await boardIdOf(handle.db, 'planning_board')
  await scheduleMeeting(
    handle.db,
    world.staff,
    {
      boardId,
      meetingDate: addDays(today, 30),
      kind: 'regular',
      location: 'Town Hall, Room 2',
      startsAtMinute: 1110,
    },
    signal,
  )
  const cancelled = await scheduleMeeting(
    handle.db,
    world.staff,
    { boardId, meetingDate: addDays(today, 40), kind: 'regular' },
    signal,
  )
  if (!cancelled.ok) throw new Error('meeting')
  await handle.db
    .update(boardMeetings)
    .set({ status: 'cancelled', cancelReason: 'No quorum' })
    .where(eq(boardMeetings.id, cancelled.value.meetingId))
  await scheduleMeetings(handle.db, world.staff, 'zba', ['2027-04-15'])
  const { store } = await makeTestStore()
  const decided = await decidedZba(handle.db, world, store, { documents: false })
  applicationId = decided.applicationId
  await handle.db
    .update(boardDecisions)
    .set({ filedOn: '2027-04-16' })
    .where(eq(boardDecisions.id, decided.decisionId))
  html = renderToStaticMarkup(await MeetingsPage({ searchParams: Promise.resolve({}) }))
  const match = /href="(\/parcels\/[0-9a-f-]{36})#record-/.exec(html)
  parcelHref = match?.[1] ?? ''
})
afterAll(async () => {
  await handle.drop()
})

describe('public meetings page', () => {
  it('leads with upcoming meetings, soonest first, with weekday, time, room and agenda state', () => {
    const text = visibleText(html)
    const upcoming = text.indexOf('Upcoming meetings')
    expect(upcoming).toBeGreaterThan(-1)
    expect(upcoming).toBeLessThan(text.indexOf('Decisions'))
    expect(text).toMatch(
      /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), \w+ \d+, \d{4} at 6:30 PM, Town Hall, Room 2/,
    )
    expect(text).toContain('Agenda not posted yet')
  })

  it('marks a cancelled meeting with a status chip', () => {
    expect(html).toMatch(/data-status="neutral"[^>]*>[\s\S]*?Cancelled<\/span>/)
  })

  it('links each decision to its application on the parcel page and to the parcel, with Granted for a variance', () => {
    expect(parcelHref).not.toBe('')
    expect(html).toContain(`href="${parcelHref}#record-${applicationId}"`)
    expect(html).toContain(`href="${parcelHref}"`)
    expect(visibleText(html)).toContain('Granted')
  })

  it('says that documents open in a new tab', () => {
    expect(visibleText(html)).toContain('open in a new tab')
  })
})

async function publicAgenda(meetingId: string): Promise<void> {
  const sha256 = randomUUID().replaceAll('-', '').padEnd(64, '0')
  await handle.db.insert(files).values({
    sha256,
    sizeBytes: 10,
    contentType: 'application/pdf',
    storageKey: `blobs/${sha256}`,
  })
  const attached = await handle.db.transaction((tx) =>
    attachDocument(
      tx,
      world.staff,
      {
        target: { kind: 'meeting', id: meetingId },
        title: 'Agenda',
        docKind: 'board_material',
        file: { sha256, filename: 'agenda.pdf', contentType: 'application/pdf' },
        audiences: ['board'],
        isPublic: true,
      },
      signal,
    ),
  )
  await handle.db.insert(agendas).values({
    meetingId,
    status: 'published',
    revision: 1,
    publishedAt: new Date(),
    documentId: attached.documentId,
  })
}

function between(text: string, from: string, to: string): string {
  return text.slice(text.indexOf(from), text.indexOf(to))
}

describe('a meeting earlier today', () => {
  it('is listed under past meetings, not upcoming', async () => {
    const made = await scheduleMeeting(
      handle.db,
      world.staff,
      {
        boardId: await boardIdOf(handle.db, 'planning_board'),
        meetingDate: '2027-06-07' as CivilDate,
        kind: 'regular',
        startsAtMinute: 600,
      },
      signal,
    )
    if (!made.ok) throw new Error('meeting')
    await publicAgenda(made.value.meetingId)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2027-06-07T18:00:00Z'))
    let text = ''
    try {
      text = visibleText(
        renderToStaticMarkup(await MeetingsPage({ searchParams: Promise.resolve({}) })),
      )
    } finally {
      vi.useRealTimers()
    }
    expect(between(text, 'Past meetings and minutes', 'Decisions')).toContain('June 7, 2027')
    expect(between(text, 'Upcoming meetings', 'Hearing notices')).not.toContain('June 7, 2027')
  })
})

describe('no past agendas or minutes', () => {
  it('points to the decisions for minutes filed with a decision', () => {
    expect(visibleText(html)).toContain(
      'No past agendas or approved meeting minutes are posted yet. Minutes filed with a decision are listed under Decisions.',
    )
  })
})
