import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { boardDecisions, boardMeetings } from '@/db/schema'
import { scheduleMeeting } from '@/features/boards/meetings'
import { type BoardWorld, boardIdOf, scheduleMeetings, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { visibleText } from '@/test/leaks'
import { makeTestStore } from '@/test/objectStore'
import { addDays, todayInTimeZone } from '@/types/civilDate'

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
