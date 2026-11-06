import { and, eq, gte, lte } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  abutterLists,
  applications,
  clocks,
  completenessVotes,
  dispositionBatches,
  legalHolds,
  meetingMinutes,
  reviewAssignments,
  selectmenCertifications,
} from '@/db/schema'
import { CORE_STATES } from '@/features/applications/states'
import { seedDemo } from '@/features/demo/seedDemo'
import { nextInspectionDay } from '@/features/demo/seedInspections'
import { seedMeetingMinutes } from '@/features/demo/seedMinutes'
import { seedNoticeContacts } from '@/features/demo/seedNoticeContacts'
import { actorFor } from '@/features/demo/seedPermitSupport'
import { loadPublicBoardRecords } from '@/features/hearings/publicRecords'
import { getDayList } from '@/features/inspections/dayList'
import { feeBalance } from '@/features/ledger/feeBalance'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
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

  it('gives the inspector at least two stops on the next inspection day', async () => {
    const inspector = await actorFor(handle.db, 'inspector', signal)
    const today = await townToday(handle.db, new Date(), signal)
    const day = await nextInspectionDay(handle.db, today, signal)
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
    const view = await loadRostersView(handle.db, staff, signal)
    expect(view?.parks.find((p) => p.name === 'Merganser Court')?.due).toBe(true)
    expect(view?.gaps.length).toBeGreaterThan(0)
    const entries = [
      ...(view?.associations ?? []),
      ...(view?.parks ?? []),
      ...(view?.restrictions ?? []),
    ]
    expect(entries.some((e) => e.uses.some((u) => u.status === 'issued'))).toBe(true)
    await seedNoticeContacts(handle.db, signal)
    const again = await loadRostersView(handle.db, staff, signal)
    expect(again?.dueCount).toBe(view?.dueCount)
  })

  it('has approved minutes for two past Planning Board meetings and a draft for the latest', async () => {
    const rows = await handle.db.select().from(meetingMinutes)
    expect(rows.map((r) => [r.status, r.approvedOn]).sort()).toEqual([
      ['approved', '2026-10-14'],
      ['approved', '2026-10-28'],
      ['draft', null],
    ])
    const published = await loadPublicBoardRecords(handle.db, signal)
    expect(published.minutes.map((m) => m.text)).toEqual([
      'Planning Board, October 14, 2026, approved October 28, 2026',
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
