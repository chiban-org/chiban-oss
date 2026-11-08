import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  abutterLists,
  agendas,
  applications,
  boardMeetings,
  boardMemberships,
  boards,
  clocks,
  completenessVotes,
  dispositionBatches,
  legalHolds,
  meetingMinutes,
  reviewAssignments,
  selectmenCertifications,
  users,
} from '@/db/schema'
import { CORE_STATES } from '@/features/applications/states'
import { DEMO_USERS, seedDemo } from '@/features/demo/seedDemo'
import { seededInspectionDay } from '@/features/demo/seedInspections'
import { seedMeetingMinutes } from '@/features/demo/seedMinutes'
import { seedNoticeContacts } from '@/features/demo/seedNoticeContacts'
import { actorFor } from '@/features/demo/seedPermitSupport'
import { loadPublicBoardRecords } from '@/features/hearings/publicRecords'
import { getDayList } from '@/features/inspections/dayList'
import { feeBalance } from '@/features/ledger/feeBalance'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { readContactsQuery } from '@/features/rosters/contactListParams'
import { loadRostersView } from '@/features/rosters/rosterView'
import { getObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { makeTestDb, type TestDb } from '@/test/db'
import { addDays } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDemo(handle.db, signal, {
    records: { mail: createMemoryTransport() },
    screenStates: true,
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('the town boards in the demo', () => {
  const boardNamed = async (name: string) => {
    const [row] = await handle.db.select().from(boards).where(eq(boards.name, name))
    if (row === undefined) throw new Error(`no board named ${name}`)
    return row
  }

  it('has four active boards, two of them the commissions added for the story', async () => {
    const rows = await handle.db.select().from(boards)
    expect(rows.map((b) => [b.kind, b.name, b.shortName, b.archivedAt]).sort()).toEqual(
      [
        [
          'conservation_commission',
          'Alder Pond Conservation Commission',
          'Conservation Commission',
          null,
        ],
        [
          'historic_district_commission',
          'Alder Pond Historic District Commission',
          'Historic District Commission',
          null,
        ],
        ['planning_board', 'Alder Pond Planning Board', 'Planning Board', null],
        ['zba', 'Alder Pond Zoning Board of Adjustment', 'Zoning Board of Adjustment', null],
      ].sort(),
    )
  })

  it('seats three members on the Conservation Commission, one of them the demo sign-in', async () => {
    const board = await boardNamed('Alder Pond Conservation Commission')
    const seats = await handle.db
      .select({ email: users.email, title: boardMemberships.title })
      .from(boardMemberships)
      .innerJoin(users, eq(users.id, boardMemberships.userId))
      .where(eq(boardMemberships.boardId, board.id))
    expect(seats.map((s) => s.email).sort()).toEqual([
      'concom.alder@alderpond.example',
      'concom.member@alderpond.example',
      'concom.pike@alderpond.example',
    ])
    expect(DEMO_USERS.map((u) => u.email)).toContain('concom.member@alderpond.example')
  })

  it('gives the Conservation Commission a past meeting with approved minutes and an upcoming one with a shown agenda', async () => {
    const board = await boardNamed('Alder Pond Conservation Commission')
    const meetings = await handle.db
      .select()
      .from(boardMeetings)
      .where(eq(boardMeetings.boardId, board.id))
      .orderBy(boardMeetings.meetingDate)
    expect(meetings.map((m) => m.meetingDate)).toEqual(['2026-10-07', '2026-11-18'])
    const [past, upcoming] = meetings
    const [minutes] = await handle.db
      .select()
      .from(meetingMinutes)
      .where(eq(meetingMinutes.meetingId, past?.id ?? ''))
    expect([minutes?.status, minutes?.approvedOn]).toEqual(['approved', '2026-10-21'])
    const [agenda] = await handle.db
      .select()
      .from(agendas)
      .where(eq(agendas.meetingId, upcoming?.id ?? ''))
    expect(agenda?.status).toBe('published')
  })

  it('gives the Historic District Commission members and one upcoming meeting', async () => {
    const board = await boardNamed('Alder Pond Historic District Commission')
    const seats = await handle.db
      .select()
      .from(boardMemberships)
      .where(eq(boardMemberships.boardId, board.id))
    expect(seats).toHaveLength(3)
    const meetings = await handle.db
      .select()
      .from(boardMeetings)
      .where(eq(boardMeetings.boardId, board.id))
    expect(meetings.map((m) => [m.meetingDate, m.status])).toEqual([['2026-11-19', 'scheduled']])
  })

  it('has one application with a comment from the Conservation Commission and one still waiting', async () => {
    const board = await boardNamed('Alder Pond Conservation Commission')
    const rows = await handle.db
      .select({
        status: reviewAssignments.status,
        commentBy: reviewAssignments.commentBy,
        comments: sql<number>`(select count(*)::int from review_comments c where c.assignment_id = review_assignments.id)`,
      })
      .from(reviewAssignments)
      .where(eq(reviewAssignments.boardId, board.id))
    expect(rows.map((r) => [r.status, r.commentBy, r.comments]).sort()).toEqual([
      ['commented', '2026-11-20', 1],
      ['pending', '2026-11-27', 0],
    ])
  })
})

describe('board demo data', () => {
  it('seeds twelve board applications in the states the story needs', async () => {
    const rows = await handle.db.select().from(applications)
    const board = rows.filter((a) => ['SPR', 'MSP', 'VAR'].some((p) => a.number.startsWith(p)))
    expect(board.map((a) => [a.number.split('-')[0], a.state]).sort()).toEqual([
      ['MSP', 'submitted'],
      ['MSP', 'submitted'],
      ['MSP', 'under_review'],
      ['SPR', 'decided'],
      ['SPR', 'submitted'],
      ['SPR', 'submitted'],
      ['SPR', 'submitted'],
      ['VAR', 'decided'],
      ['VAR', 'denied'],
      ['VAR', 'submitted'],
      ['VAR', 'submitted'],
      ['VAR', 'under_review'],
    ])
  })

  it('has issued lists, a draft list with an undecided tenant, and one vote and certification', async () => {
    const lists = await handle.db.select().from(abutterLists)
    expect(lists.filter((l) => l.status === 'issued')).toHaveLength(10)
    expect(lists.filter((l) => l.status === 'draft')).toHaveLength(1)
    expect(await handle.db.select().from(completenessVotes)).toHaveLength(3)
    expect((await handle.db.select().from(selectmenCertifications))[0]?.outcome).toBe('pending')
  })
})

describe('states the screens tell apart', () => {
  it('has an application in every state', async () => {
    const states = new Set((await handle.db.select().from(applications)).map((a) => a.state))
    expect([...states].sort()).toEqual([...CORE_STATES].sort())
  })

  it('has a decided building permit ready to issue with its fee still due', async () => {
    const decided = await handle.db
      .select()
      .from(applications)
      .where(and(eq(applications.state, 'decided'), eq(applications.applicationTypeKey, 'BP')))
    const dues = await Promise.all(
      decided.map(async (a) => (await feeBalance(handle.db, a.id, signal)).dueCents),
    )
    expect(dues.some((due) => due > 0)).toBe(true)
  })

  it('has a building permit and a variance with a deadline due this week', async () => {
    const today = await townToday(handle.db, new Date(), signal)
    const rows = await handle.db
      .select({ type: applications.applicationTypeKey })
      .from(clocks)
      .innerJoin(applications, eq(applications.id, clocks.applicationId))
      .where(
        and(
          eq(clocks.status, 'running'),
          gte(clocks.currentDue, today),
          lte(clocks.currentDue, addDays(today, 7)),
        ),
      )
    expect(rows.map((r) => r.type)).toEqual(expect.arrayContaining(['BP', 'VAR']))
  })

  it("gives the reviewer a review closed by the applicant's withdrawal", async () => {
    const reviewer = await actorFor(handle.db, 'reviewer', signal)
    const rows = await handle.db
      .select({ status: reviewAssignments.status })
      .from(reviewAssignments)
      .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
      .where(
        and(
          eq(reviewAssignments.reviewerUserId, reviewer.userId),
          eq(applications.state, 'withdrawn'),
        ),
      )
    expect(rows.map((r) => r.status)).toEqual(['pending'])
  })

  it('gives the records custodian a released hold and a batch waiting for approval', async () => {
    const holds = await handle.db.select().from(legalHolds)
    expect(holds.filter((h) => h.releasedAt !== null)).toHaveLength(1)
    const batches = await handle.db.select().from(dispositionBatches)
    expect(batches.map((b) => b.status).sort()).toEqual(['executed', 'proposed'])
  })

  it('gives the inspector at least two stops on the seeded inspection day', async () => {
    const inspector = await actorFor(handle.db, 'inspector', signal)
    const today = await townToday(handle.db, new Date(), signal)
    const day = await seededInspectionDay(handle.db, today, signal)
    const list = await getDayList(
      handle.db,
      inspector,
      { inspectorUserId: inspector.userId, date: day },
      signal,
    )
    expect(list.ok && list.value.filter((s) => s.status === 'scheduled').length).toBeGreaterThan(1)
  })

  it('shows notice contacts with one due for a check, one gap and one used on a list', async () => {
    const staff = await actorFor(handle.db, 'staff', signal)
    const tab = async (kind: string) =>
      await loadRostersView(handle.db, staff, signal, { query: readContactsQuery({ kind }).query })
    const view = await tab('parks')
    const parks = view?.list?.tab === 'parks' ? view.list.rows : []
    expect(parks.find((p) => p.name === 'Merganser Court')?.due).toBe(true)
    expect(view?.gapCount).toBeGreaterThan(0)
    const entries = []
    for (const kind of ['associations', 'parks', 'holders']) {
      entries.push(...((await tab(kind))?.list?.rows ?? []))
    }
    expect(entries.some((e) => e.uses.some((u) => u.status === 'issued'))).toBe(true)
    await seedNoticeContacts(handle.db, signal)
    const again = await loadRostersView(handle.db, staff, signal)
    expect(again?.dueCount).toBe(view?.dueCount)
  })

  it('has approved minutes for two past Planning Board meetings and one Conservation Commission meeting, and a draft for the latest Planning Board meeting', async () => {
    const rows = await handle.db.select().from(meetingMinutes)
    expect(rows.map((r) => [r.status, r.approvedOn]).sort()).toEqual([
      ['approved', '2026-10-14'],
      ['approved', '2026-10-21'],
      ['approved', '2026-10-28'],
      ['draft', null],
    ])
    const published = await loadPublicBoardRecords(handle.db, signal)
    expect(published.minutes.map((m) => m.text)).toEqual([
      'Planning Board, October 14, 2026, approved October 28, 2026',
      'Conservation Commission, October 7, 2026, approved October 21, 2026',
      'Planning Board, September 23, 2026, approved October 14, 2026',
    ])
    const staff = await actorFor(handle.db, 'staff', signal)
    const again = await seedMeetingMinutes({
      db: handle.db,
      store: getObjectStore(),
      mail: createMemoryTransport(),
      signal,
      now: new Date(),
      today: await townToday(handle.db, new Date(), signal),
      cast: { admin: staff, staff, applicant: staff },
    })
    expect(again).toBe(false)
  })
})
