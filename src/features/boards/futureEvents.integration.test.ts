import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes, boardDecisions, clocks, hearings } from '@/db/schema'
import { addAppealNode } from '@/features/appeals/graph'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { recordDecision } from '@/features/decisions/recordDecision'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import type { ObjectStore } from '@/features/storage/objectStore'
import {
  type BoardWorld,
  boardIdSql,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba, FIXTURE_VOTES, heldZbaHearing } from '@/test/hearingFixtures'
import { issueFixtureList } from '@/test/listFixtures'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const eveningBefore = (date: string) =>
  new Date(new Date(`${date}T16:00:00Z`).getTime() - 24 * 60 * 60 * 1000)
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function meetingIdOn(date: string, board: 'planning_board' | 'zba') {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: equals }) =>
      and(equals(m.meetingDate, date), equals(m.boardId, boardIdSql(board))),
  })
  return rows[0]?.id ?? ''
}

async function noticedZbaHearing(): Promise<string> {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id)
  await issueListWithRecipients(handle.db, world, id, [recipient(1)])
  const made = await scheduleHearing(
    handle.db,
    world.staff,
    {
      applicationId: id,
      meetingId: await meetingIdOn('2027-04-15', 'zba'),
      kind: 'public_hearing',
    },
    signal,
  )
  if (!made.ok) throw new Error('schedule')
  const hearing = await handle.db.query.hearings.findFirst({
    where: (h, { eq: equals }) => equals(h.id, made.value.hearingId),
  })
  const now = new Date('2027-04-01T16:00:00Z')
  await proveEverything(handle.db, world, id, hearing?.noticeSetId ?? '', d('2027-03-30'), now)
  await markProperlyNoticed(handle.db, world.staff, made.value.hearingId, signal, now)
  return made.value.hearingId
}

describe('events that have not happened yet cannot be recorded', () => {
  it('a completeness vote dated after today is future_date and stops no clock', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    await recordNoRegionalImpact(handle.db, world, id)
    await issueFixtureList(handle.db, world, id, '2027-03-24')
    const meetingId = await meetingIdOn('2027-04-14', 'planning_board')
    await setAcceptanceMeeting(handle.db, world.staff, { applicationId: id, meetingId }, signal)
    const result = await recordCompletenessVote(
      handle.db,
      world.staff,
      { applicationId: id, meetingId, votedOn: d('2027-04-14'), outcome: 'accepted' },
      signal,
      eveningBefore('2027-04-14'),
    )
    expect(result).toEqual({ ok: false, error: 'future_date' })
    const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    expect(rows.find((c) => c.ruleKey === 'nh.pb.completeness')?.status).toBe('running')
  })

  it('a hearing marked held after today is future_date and stays scheduled', async () => {
    const hearingId = await noticedZbaHearing()
    const result = await markHearingHeld(
      handle.db,
      world.staff,
      { hearingId, heldOn: d('2027-04-15') },
      signal,
      eveningBefore('2027-04-15'),
    )
    expect(result).toEqual({ ok: false, error: 'future_date' })
    const [row] = await handle.db.select().from(hearings).where(eq(hearings.id, hearingId))
    expect(row?.status).toBe('scheduled')
  })

  it('a decision voted after today is future_date and records nothing', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const result = await recordDecision(
      handle.db,
      world.staff,
      {
        applicationId: held.applicationId,
        hearingId: held.hearingId,
        votedOn: d('2027-04-16'),
        outcome: 'approved',
        motion: 'Move to approve.',
        votes: FIXTURE_VOTES,
        findings: 'The proposal meets each criterion.',
      },
      signal,
      new Date('2027-04-15T16:00:00Z'),
    )
    expect(result).toEqual({ ok: false, error: 'future_date' })
    const rows = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.hearingId, held.hearingId))
    expect(rows).toEqual([])
  })

  it('an appeal step dated after today is future_date and adds no node', async () => {
    const made = await decidedZba(handle.db, world, store, { documents: false })
    const [parent] = await handle.db
      .select()
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, made.applicationId))
    const result = await addAppealNode(
      handle.db,
      world.staff,
      { parentId: parent?.id ?? '', kind: 'rehearing_motion', occurredOn: d('2027-04-20') },
      signal,
      new Date('2027-04-19T16:00:00Z'),
    )
    expect(result).toEqual({ ok: false, error: 'future_date' })
    const nodes = await handle.db
      .select()
      .from(appealNodes)
      .where(eq(appealNodes.applicationId, made.applicationId))
    expect(nodes).toHaveLength(1)
  })
})
