import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  agendaItems,
  agendas,
  appealNodes,
  applications,
  boardDecisions,
  boardMeetings,
  boardMemberships,
  boardPacketLinks,
  boardPacketMembers,
  boardPackets,
  documents,
  hearings,
  noticeItems,
  projects,
  trcRoutings,
  users,
} from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { listMeetingTable } from '@/features/boards/meetingList'
import { readMeetingListView } from '@/features/boards/meetingListParams'
import { listMemberMeetings } from '@/features/boards/memberPackets'
import { pendingChanges } from '@/features/boards/packetChanges'
import { packetItemRows } from '@/features/boards/packetContents'
import { trackPacket } from '@/features/boards/packetTrack'
import { activeBoards } from '@/features/boards/townBoards'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { seedDemo } from '@/features/demo/seedDemo'
import { actorFor } from '@/features/demo/seedPermitSupport'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { trcSummary } from '@/features/reviews/trcSummary'
import { townToday } from '@/features/town/today'
import { boardIdOf } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps, useDemoStoryClock } from '@/test/demoSeedDeps'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

async function member(local: string) {
  const [row] = await handle.db
    .select()
    .from(users)
    .where(eq(users.email, `${local}@${DEMO_DOMAIN}`))
  const actor = await loadActor(handle.db, row?.id ?? '', signal)
  if (actor === null) throw new Error(`no ${local}`)
  return actor
}

async function packetFor(meetingId: string) {
  const [row] = await handle.db
    .select()
    .from(boardPackets)
    .where(eq(boardPackets.meetingId, meetingId))
  return row
}

async function meetingOn(board: 'planning_board' | 'zba', date: string): Promise<string> {
  const boardId = await boardIdOf(handle.db, board)
  const [row] = await handle.db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(and(eq(boardMeetings.boardId, boardId), eq(boardMeetings.meetingDate, date)))
  return row?.id ?? ''
}

describe('hearing demo data', () => {
  it('the granted variance has an approved, filed decision voted at its hearing', async () => {
    const [found] = await handle.db
      .select({ app: applications })
      .from(applications)
      .innerJoin(projects, eq(projects.id, applications.projectId))
      .where(eq(projects.title, 'Demo permit: Bittern Meadow frontage variance'))
    const app = found?.app
    expect(app?.state).toBe('decided')
    const rows = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.applicationId, app?.id ?? ''))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ outcome: 'approved', votedOn: '2026-09-15' })
    expect(rows[0]?.filedOn).not.toBeNull()
    const [hearing] = await handle.db
      .select()
      .from(hearings)
      .where(eq(hearings.id, rows[0]?.hearingId ?? ''))
    expect(hearing).toMatchObject({ status: 'held', heldOn: '2026-09-15' })
  })

  it('seats five members on each board, with public accounts', async () => {
    const rows = await handle.db.select().from(boardMemberships)
    const bea = await member('board')
    const seats = rows.filter((r) => r.userId !== bea.userId)
    const planningId = await boardIdOf(handle.db, 'planning_board')
    const zbaId = await boardIdOf(handle.db, 'zba')
    expect(seats.filter((r) => r.boardId === planningId)).toHaveLength(5)
    expect(seats.filter((r) => r.boardId === zbaId)).toHaveLength(5)
    expect((await member('pb.member')).kind).toBe('public')
  })

  it('seats the staff board member Bea Board on the ZBA once, even when seeded again', async () => {
    const bea = await member('board')
    expect(bea.kind).toBe('staff')
    await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
    const seats = await handle.db
      .select({ boardId: boardMemberships.boardId })
      .from(boardMemberships)
      .where(eq(boardMemberships.userId, bea.userId))
    expect(seats).toEqual([{ boardId: await boardIdOf(handle.db, 'zba') }])
  })

  it('has published agendas for the Planning Board, the Zoning Board and the Conservation Commission, and one draft agenda', async () => {
    const rows = await handle.db.select().from(agendas)
    expect(rows.filter((a) => a.status === 'published')).toHaveLength(3)
    expect(rows.filter((a) => a.status === 'draft')).toHaveLength(1)
  })

  it("seeded board members see only their board's meeting in /board, with its packet", async () => {
    const zba = await listMemberMeetings(
      handle.db,
      await member('zba.member'),
      { limit: 25 },
      signal,
    )
    expect(zba.rows.map((r) => [r.boardId, r.hasPacket])).toEqual([
      [await boardIdOf(handle.db, 'zba'), true],
    ])
    const pb = await listMemberMeetings(handle.db, await member('pb.member'), { limit: 25 }, signal)
    expect(pb.rows.map((r) => [r.boardId, r.hasPacket])).toEqual([
      [await boardIdOf(handle.db, 'planning_board'), true],
    ])
  })

  it('the November 12 Planning Board meeting has hearings that are not on an agenda yet', async () => {
    const meetingId = await meetingOn('planning_board', '2026-11-12')
    const scheduled = await handle.db
      .select()
      .from(hearings)
      .where(and(eq(hearings.meetingId, meetingId), eq(hearings.status, 'scheduled')))
    expect(scheduled.length).toBeGreaterThanOrEqual(2)
    expect(
      await handle.db.select().from(agendaItems).where(eq(agendaItems.meetingId, meetingId)),
    ).toEqual([])
  })

  it('the meeting table counts the hearings at each meeting', async () => {
    const boardIds = (await activeBoards(handle.db)).map((b) => b.id)
    const page = await listMeetingTable(
      handle.db,
      await actorFor(handle.db, 'staff', signal),
      { ...readMeetingListView({}, boardIds), boardIds, today: '2026-11-01', limit: 50, offset: 0 },
      signal,
    )
    const nov12 = page?.rows.find((r) => r.meetingDate === '2026-11-12')
    expect(nov12?.hearings).toBeGreaterThanOrEqual(2)
    expect(nov12?.packetSent).toBe(false)
    expect(page?.rows.find((r) => r.meetingDate === '2026-12-15')?.packetSent).toBe(true)
  })

  it('has a cancelled special meeting that is still ahead, with its reason', async () => {
    const today = await townToday(handle.db, new Date(), signal)
    const cancelled = await handle.db
      .select()
      .from(boardMeetings)
      .where(eq(boardMeetings.status, 'cancelled'))
    expect(cancelled.map((m) => m.kind)).toEqual(['special'])
    expect((cancelled[0]?.meetingDate ?? '') >= today).toBe(true)
    expect(cancelled[0]?.cancelReason).not.toBe('')
  })

  it('has one sent packet with reads and one with a change not sent, and seeding again adds nothing', async () => {
    const sentPacket = await packetFor(await meetingOn('planning_board', '2026-12-09'))
    expect(sentPacket?.sentAt).not.toBeNull()
    const reads = await trackPacket(handle.db, sentPacket?.id ?? '')
    expect(reads.some((r) => r.firstOpenedAt !== null && r.documentsOpened > 0)).toBe(true)
    const changed = await packetFor(await meetingOn('zba', '2026-12-15'))
    const rows = await packetItemRows(handle.db, changed?.id ?? '')
    const pending = changed === undefined ? null : pendingChanges(rows, changed)
    expect(pending?.added.map((r) => r.title)).toEqual(['Zoning administrator memo'])
    await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
    const again = await packetItemRows(handle.db, changed?.id ?? '')
    expect(again).toHaveLength(rows.length)
    expect(await trackPacket(handle.db, sentPacket?.id ?? '')).toEqual(reads)
  })

  it('sends a packet that the migration marked sent but no member received when seeded again', async () => {
    const packet = await packetFor(await meetingOn('planning_board', '2026-12-09'))
    const members = eq(boardPacketMembers.packetId, packet?.id ?? '')
    const before = await handle.db.select().from(boardPacketMembers).where(members)
    await handle.db.delete(boardPacketMembers).where(members)
    await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
    expect(await handle.db.select().from(boardPacketMembers).where(members)).toHaveLength(
      before.length,
    )
  })

  it('has a packet link that is still open', async () => {
    const links = await handle.db.select().from(boardPacketLinks)
    expect(links.some((l) => l.revokedAt === null && l.expiresAt > new Date())).toBe(true)
  })

  it('removes the old demo packet that names no meeting when seeded again', async () => {
    const staff = await actorFor(handle.db, 'staff', signal)
    const [stale] = await handle.db
      .insert(boardPackets)
      .values({
        title: 'Planning Board agenda',
        boardId: await boardIdOf(handle.db, 'planning_board'),
        meetingDate: '2026-07-14',
        createdBy: staff.userId,
      })
      .returning({ id: boardPackets.id })
    await seedDemo(handle.db, signal, { ...(await demoSeedDeps()), screenStates: true })
    const left = await handle.db
      .select()
      .from(boardPackets)
      .where(eq(boardPackets.id, stale?.id ?? ''))
    expect(left).toEqual([])
    expect((await handle.db.select().from(boardPackets)).every((p) => p.meetingId !== null)).toBe(
      true,
    )
  })

  it('has a site plan decision with conditions, filed on time, with every notice item proved', async () => {
    const [decision] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.outcome, 'approved_with_conditions'))
    expect(decision).toMatchObject({ filedOn: '2026-10-21' })
    expect(decision?.conditions).toHaveLength(2)
    const [hearing] = await handle.db
      .select()
      .from(hearings)
      .where(eq(hearings.applicationId, decision?.applicationId ?? ''))
    const status = await noticeStatus(handle.db, hearing?.noticeSetId ?? '', signal)
    expect(status.properlyNoticed).toBe(true)
    const [minutes] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.title, 'Minutes of October 14'))
    expect(minutes?.docKind).toBe('attachment')
  })

  it('has a variance hearing continued without announcement and missing newspaper proof', async () => {
    const continued = await handle.db
      .select()
      .from(hearings)
      .where(eq(hearings.status, 'continued'))
    expect(continued).toHaveLength(1)
    const [fresh] = await handle.db
      .select()
      .from(hearings)
      .where(
        and(
          eq(hearings.continuedFrom, continued[0]?.id ?? ''),
          eq(hearings.continuationAnnounced, false),
        ),
      )
    expect(fresh?.properlyNoticedAt).toBeNull()
    const items = await handle.db
      .select()
      .from(noticeItems)
      .where(eq(noticeItems.setId, fresh?.noticeSetId ?? ''))
    expect(items.some((i) => i.channel === 'newspaper')).toBe(true)
    const old = await noticeStatus(handle.db, continued[0]?.noticeSetId ?? '', signal)
    expect(old.items.filter((i) => i.state === 'missing').map((i) => i.channel)).toEqual([
      'newspaper',
    ])
  })

  it('has a zba denial with a rehearing motion', async () => {
    const [denial] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.outcome, 'denied'))
    expect(denial?.reasonsForDisapproval).not.toBeNull()
    const nodes = await handle.db
      .select()
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, denial?.applicationId ?? ''))
    expect(nodes.map((n) => n.kind).sort()).toEqual(['rehearing_motion', 'zba_decision'])
  })

  it('has three Technical Review Committee departments with one sign-off', async () => {
    const [routed] = await handle.db.select().from(trcRoutings)
    const summary = await trcSummary(
      handle.db,
      await actorFor(handle.db, 'staff', signal),
      routed?.applicationId ?? '',
      signal,
    )
    if (!summary.ok) throw new Error(summary.error)
    expect(summary.value.map((s) => s.departmentLabel).sort()).toEqual([
      'Fire',
      'Police',
      'Public Works',
    ])
    expect(summary.value.filter((s) => s.status === 'signed_off')).toHaveLength(1)
  })
})
