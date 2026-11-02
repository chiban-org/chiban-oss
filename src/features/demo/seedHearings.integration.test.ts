import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  agendas,
  appealNodes,
  applications,
  boardDecisions,
  boardMemberships,
  documents,
  hearings,
  noticeItems,
  projects,
  trcRoutings,
  users,
} from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { listMemberMeetings } from '@/features/boards/memberPackets'
import { DEMO_DOMAIN } from '@/features/demo/domain'
import { seedDemo } from '@/features/demo/seedDemo'
import { actorFor } from '@/features/demo/seedPermitSupport'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { trcSummary } from '@/features/reviews/trcSummary'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDemo(handle.db, signal, await demoSeedDeps())
})
afterAll(async () => {
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
    expect(rows[0]).toMatchObject({ outcome: 'approved', votedOn: '2026-04-15' })
    expect(rows[0]?.filedOn).not.toBeNull()
    const [hearing] = await handle.db
      .select()
      .from(hearings)
      .where(eq(hearings.id, rows[0]?.hearingId ?? ''))
    expect(hearing).toMatchObject({ status: 'held', heldOn: '2026-04-15' })
  })

  it('seats five members on each board, with public accounts', async () => {
    const rows = await handle.db.select().from(boardMemberships)
    expect(rows.filter((r) => r.board === 'planning_board')).toHaveLength(5)
    expect(rows.filter((r) => r.board === 'zba')).toHaveLength(5)
    expect((await member('pb.member')).kind).toBe('public')
  })

  it('has one published agenda', async () => {
    const rows = await handle.db.select().from(agendas)
    expect(rows.filter((a) => a.status === 'published')).toHaveLength(1)
  })

  it("seeded board member sees only their board's meeting in /board", async () => {
    const zba = await listMemberMeetings(
      handle.db,
      await member('zba.member'),
      { limit: 25 },
      signal,
    )
    expect(zba.rows.map((r) => r.board)).toEqual(['zba'])
    const pb = await listMemberMeetings(handle.db, await member('pb.member'), { limit: 25 }, signal)
    expect(pb.rows).toEqual([])
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
