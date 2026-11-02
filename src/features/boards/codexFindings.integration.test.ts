import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks } from '@/db/schema'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { currentIssuedList } from '@/features/abutters/queries'
import { transitionApplication } from '@/features/applications/transition'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { linkReliance, recordFinalApproval } from '@/features/boards/exercise'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { adjustClock } from '@/features/clocks/adjustClock'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import {
  type BoardWorld,
  publishRegionalContacts,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueFixtureList, LIST_NOW, prepareListWorld } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function meetingId(date: string): Promise<string> {
  const rows = await handle.db.query.boardMeetings.findMany()
  return rows.find((m) => m.meetingDate === date && m.board === 'planning_board')?.id ?? ''
}

async function filedWithList(received = '2027-03-24'): Promise<string> {
  const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, received)
  await recordNoRegionalImpact(handle.db, world, id)
  await issueFixtureList(handle.db, world, id, received)
  return id
}

describe('review: reliance pending blocks the lapse', () => {
  it('an approval with an unresolved reliance application is not expired by the daily job', async () => {
    const variance = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await handle.db
      .update(applications)
      .set({ state: 'decided' })
      .where(eq(applications.id, variance))
    await handle.db.transaction((tx) =>
      recordFinalApproval(
        tx,
        world.staff,
        { applicationId: variance, finalOn: d('2027-05-12') },
        signal,
      ),
    )
    const planning = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-06-02')
    await linkReliance(
      handle.db,
      world.staff,
      { varianceApplicationId: variance, planningApplicationId: planning },
      signal,
    )
    await runJob(handle.db, clocksDailyJob, { today: d('2029-05-13') }, signal)
    const [app] = await handle.db.select().from(applications).where(eq(applications.id, variance))
    expect(app?.state).toBe('decided')
  })
})

describe('review: the acceptance workflow cannot be bypassed', () => {
  it('moving a submitted board application to under review without a vote is invalid', async () => {
    const id = await filedWithList()
    const [row] = await handle.db.select().from(applications).where(eq(applications.id, id))
    const moved = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.staff,
        { applicationId: id, to: 'under_review', expectedRowVersion: row?.rowVersion ?? 0 },
        signal,
      ),
    )
    expect(moved).toEqual({ ok: false, error: 'invalid_transition' })
  })

  it('a vote at a meeting that was never set for the application is meeting_not_set', async () => {
    const id = await filedWithList('2027-03-25')
    const vote = await recordCompletenessVote(
      handle.db,
      world.staff,
      {
        applicationId: id,
        meetingId: await meetingId('2027-04-14'),
        votedOn: d('2027-04-14'),
        outcome: 'accepted',
      },
      signal,
    )
    expect(vote).toEqual({ ok: false, error: 'meeting_not_set' })
  })
})

describe('review: regional impact recalculation keeps an extension', () => {
  it('an applicant-consent extension survives a change to regional impact yes', async () => {
    await publishRegionalContacts(handle.db, world)
    const id = await filedWithList()
    await setAcceptanceMeeting(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: await meetingId('2027-04-14') },
      signal,
    )
    await recordCompletenessVote(
      handle.db,
      world.staff,
      {
        applicationId: id,
        meetingId: await meetingId('2027-04-14'),
        votedOn: d('2027-04-14'),
        outcome: 'accepted',
      },
      signal,
    )
    const [clock] = await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    const decision = (
      await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))
    ).find((c) => c.ruleKey === 'nh.pb.decision')
    expect(clock).toBeDefined()
    await adjustClock(
      handle.db,
      world.staff,
      {
        clockId: decision?.id ?? '',
        kind: 'extension',
        days: 30,
        reason: 'Applicant asked',
        applicantConsent: true,
      },
      signal,
    )
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId: id, determination: 'yes', municipalityKeys: ['dunmore'] },
      signal,
      LIST_NOW,
    )
    const live = (await handle.db.select().from(clocks).where(eq(clocks.applicationId, id))).find(
      (c) => c.ruleKey === 'nh.pb.decision' && c.status === 'running',
    )
    expect(live?.currentDue).toBe('2027-08-17')
  })
})

describe('review: issuing re-resolves the recipients', () => {
  it('a determination changed after the draft was drawn is applied at issue', async () => {
    await publishRegionalContacts(handle.db, world)
    const lw = await prepareListWorld(handle.db, world)
    const made = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    if (!made.ok) throw new Error('generate failed')
    await handle.db.execute(
      (await import('drizzle-orm'))
        .sql`update regional_impact_determinations set determination = 'yes' where application_id = ${lw.applicationId}`,
    )
    const issued = await issueList(
      handle.db,
      world.staff,
      { listId: made.value.listId },
      signal,
      LIST_NOW,
    )
    expect(issued.ok).toBe(true)
    const roles = (
      await currentIssuedList(handle.db, lw.applicationId, signal)
    )?.snapshot.recipients.map((r) => r.roles[0])
    expect(roles).toContain('regional_planning_commission')
  })

  it('two issues of one draft at once issue it exactly once', async () => {
    await publishRegionalContacts(handle.db, world)
    const lw = await prepareListWorld(handle.db, world)
    const made = await generateList(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId },
      signal,
      LIST_NOW,
    )
    if (!made.ok) throw new Error('generate failed')
    const results = await Promise.all([
      issueList(handle.db, world.staff, { listId: made.value.listId }, signal, LIST_NOW),
      issueList(handle.db, world.staff, { listId: made.value.listId }, signal, LIST_NOW),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'not_draft' }])
  })
})
