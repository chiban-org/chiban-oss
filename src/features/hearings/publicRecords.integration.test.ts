import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agendas, boardDecisions, boardMeetings, files } from '@/db/schema'
import { scheduleMeeting } from '@/features/boards/meetings'
import { attachDocument } from '@/features/documents/attach'
import { loadPastMeetings, loadUpcomingMeetings } from '@/features/hearings/publicMeetings'
import { loadPublicDecisions } from '@/features/hearings/publicRecords'
import { type BoardWorld, boardIdOf, scheduleMeetings, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'
import { addDays, type CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const TODAY = '2027-03-01' as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { pbMeetings: [] })
})
afterEach(async () => {
  await handle.drop()
})

async function meeting(
  date: CivilDate,
  extra: { location?: string; startsAtMinute?: number } = {},
) {
  const made = await scheduleMeeting(
    handle.db,
    world.staff,
    {
      boardId: await boardIdOf(handle.db, 'planning_board'),
      meetingDate: date,
      kind: 'regular',
      ...extra,
    },
    signal,
  )
  if (!made.ok) throw new Error('meeting')
  return made.value.meetingId
}

async function publishAgenda(meetingId: string, isPublic = true): Promise<string> {
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
        isPublic,
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
  return attached.documentId
}

async function pastAgendas(count: number, privateCount = 0) {
  for (let i = 0; i < count + privateCount; i += 1) {
    const id = await meeting(addDays('2026-01-06' as CivilDate, i * 7))
    await publishAgenda(id, i < count)
  }
}

describe('upcoming meetings', () => {
  it('lists meetings from today on, soonest first, with time, room and agenda or none', async () => {
    const later = await meeting('2027-03-17' as CivilDate, { location: 'Town Hall, Room 2' })
    const sooner = await meeting(TODAY, { startsAtMinute: 1110 })
    await meeting('2027-02-15' as CivilDate)
    const agendaId = await publishAgenda(later)
    const upcoming = await loadUpcomingMeetings(handle.db, TODAY, signal)
    expect(upcoming.map((m) => m.meetingId)).toEqual([sooner, later])
    expect(upcoming[0]).toMatchObject({
      boardShortName: 'Planning Board',
      meetingDate: TODAY,
      startsAtMinute: 1110,
      agendaDocumentId: null,
      cancelled: false,
    })
    expect(upcoming[1]).toMatchObject({ location: 'Town Hall, Room 2', agendaDocumentId: agendaId })
  })

  it('keeps a cancelled meeting in the list, marked cancelled', async () => {
    const id = await meeting('2027-03-10' as CivilDate)
    await handle.db
      .update(boardMeetings)
      .set({ status: 'cancelled', cancelReason: 'No quorum' })
      .where(eq(boardMeetings.id, id))
    const [only] = await loadUpcomingMeetings(handle.db, TODAY, signal)
    expect(only).toMatchObject({ meetingId: id, cancelled: true })
  })

  it('leaves out an agenda that is not public', async () => {
    const id = await meeting('2027-03-10' as CivilDate)
    await publishAgenda(id, false)
    const [only] = await loadUpcomingMeetings(handle.db, TODAY, signal)
    expect(only?.agendaDocumentId).toBeNull()
  })
})

describe('past meetings', () => {
  it('25 past meetings with agendas show 20 on the first page and 5 on the second, newest first', async () => {
    await pastAgendas(25)
    const first = await loadPastMeetings(handle.db, { today: TODAY, page: 1 }, signal)
    const second = await loadPastMeetings(handle.db, { today: TODAY, page: 2 }, signal)
    expect([first.meetings.length, second.meetings.length]).toEqual([20, 5])
    expect(first.meetings[0]?.meetingDate).toBe('2026-06-23')
    expect(first.page).toEqual({ page: 1, hasNext: true })
    expect(second.page).toEqual({ page: 2, hasNext: false })
  })

  it('meetings whose agenda is not public do not use up the page', async () => {
    await pastAgendas(20, 3)
    const first = await loadPastMeetings(handle.db, { today: TODAY, page: 1 }, signal)
    expect(first.meetings.length).toBe(20)
    expect(first.page).toEqual({ page: 1, hasNext: false })
  })

  it('leaves an agenda for today or later to the upcoming list', async () => {
    await publishAgenda(await meeting(TODAY))
    const past = await loadPastMeetings(handle.db, { today: TODAY, page: 1 }, signal)
    expect(past.meetings).toEqual([])
  })
})

describe('public decisions', () => {
  it('lists a filed decision with its application, parcel and the outcome words the parcel page uses', async () => {
    await scheduleMeetings(handle.db, world.staff, 'zba', ['2027-04-15'])
    const { store } = await makeTestStore()
    const decided = await decidedZba(handle.db, world, store, { documents: false })
    expect((await loadPublicDecisions(handle.db, { page: 1 }, signal)).decisions).toEqual([])
    await handle.db
      .update(boardDecisions)
      .set({ filedOn: '2027-04-16' })
      .where(eq(boardDecisions.id, decided.decisionId))
    const { decisions, page } = await loadPublicDecisions(handle.db, { page: 1 }, signal)
    expect(page).toEqual({ page: 1, hasNext: false })
    expect(decisions).toHaveLength(1)
    expect(decisions[0]).toMatchObject({
      applicationId: decided.applicationId,
      outcome: { label: 'Granted', chip: 'passed' },
      votedOn: '2027-04-15',
      filedOn: '2027-04-16',
    })
    expect(decisions[0]?.boardShortName).not.toBe('')
    expect(decisions[0]?.applicationNumber).toMatch(/^VAR-/)
    expect(decisions[0]?.parcel.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
