import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes, applications, clocks, projects } from '@/db/schema'
import { addAppealNode } from '@/features/appeals/graph'
import { projectFinality } from '@/features/appeals/projectFinality'
import { START_EVENT_LABELS } from '@/features/clocks/explainClock'
import { type RecordDecisionInput, recordDecision } from '@/features/decisions/recordDecision'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { loadHearingView } from '@/features/hearings/views'
import { setActivePackForTest } from '@/features/packs/registry'
import type { StatePack } from '@/features/packs/schema'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdSql,
  boardTypeBody,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES, heldZbaHearing } from '@/test/hearingFixtures'
import {
  XX_DENIAL_WINDOW,
  XX_FINAL_APPROVAL_WINDOW,
  XX_PB_FINAL_WINDOW,
  XX_PROJECT_FINALITY,
  XX_PROJECT_FINALITY_BY_BOARD,
} from '@/test/packs/xx/projectFinality'
import { XX_PB_SUBDIVISION_KEY } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const ZBA_VOTE = '2027-04-15'
const PB_VOTE = '2027-04-28'
const SUB_TYPE_KEY = 'SUB'

let handle: TestDb
let world: BoardWorld

async function meetingOn(date: string, board: 'planning_board' | 'zba'): Promise<string> {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and: both, eq: same }) =>
      both(same(m.meetingDate, date), same(m.boardId, boardIdSql(board))),
  })
  return rows[0]?.id ?? ''
}

async function underReview(typeKey: string): Promise<string> {
  const applicationId = await submitBoardApplication(handle.db, world, typeKey, '2027-03-02')
  await handle.db
    .update(applications)
    .set({ state: 'under_review' })
    .where(eq(applications.id, applicationId))
  return applicationId
}

async function decide(
  applicationId: string,
  board: 'planning_board' | 'zba',
  overrides: Partial<RecordDecisionInput> = {},
): Promise<string> {
  const votedOn = board === 'zba' ? ZBA_VOTE : PB_VOTE
  const recorded = await recordDecision(
    handle.db,
    world.staff,
    {
      applicationId,
      hearingId: null,
      meetingId: await meetingOn(votedOn, board),
      votedOn: d(votedOn),
      outcome: 'approved',
      motion: 'Move to approve as presented.',
      votes: FIXTURE_VOTES,
      findings: 'The proposal meets each criterion of the ordinance.',
      ...overrides,
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!recorded.ok) throw new Error(JSON.stringify(recorded.error))
  return recorded.value.decisionId
}

async function decisionNodeOf(applicationId: string): Promise<string> {
  const [node] = await handle.db
    .select({ id: appealNodes.id })
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
  return node?.id ?? ''
}

async function petition(parentId: string, occurredOn: string) {
  return await addAppealNode(
    handle.db,
    world.staff,
    { parentId, kind: 'court_petition', occurredOn: d(occurredOn) },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

async function petitionUntimely(parentId: string, occurredOn: string): Promise<boolean> {
  const added = await petition(parentId, occurredOn)
  if (!added.ok) throw new Error(added.error)
  const [row] = await handle.db
    .select({ untimely: appealNodes.untimely })
    .from(appealNodes)
    .where(eq(appealNodes.id, added.value.nodeId))
  return row?.untimely ?? false
}

async function clocksOf(applicationId: string, ruleKey: string) {
  return await handle.db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, ruleKey)))
}

function underPack(pack: StatePack) {
  beforeAll(() => {
    setActivePackForTest(pack)
  })
  afterAll(() => {
    setActivePackForTest(null)
  })
  beforeEach(async () => {
    handle = await makeTestDb()
    world = await setupBoardWorld(handle.db, {
      zbaMeetings: [ZBA_VOTE],
      pack,
      classificationKey: 'xx.board_variance',
    })
    await saveAndPublish(
      handle.db,
      world.admin,
      'application_type',
      SUB_TYPE_KEY,
      boardTypeBody(XX_PB_SUBDIVISION_KEY, SUB_TYPE_KEY, SUB_TYPE_KEY, {}, pack),
    )
  })
}

afterEach(async () => {
  await handle.drop()
})

describe('a pack whose approval windows wait for the last municipal approval', () => {
  underPack(XX_PROJECT_FINALITY)

  it('starts no approval window on an approval that is not the last one', async () => {
    const variance = await underReview(world.zbaTypeKey)
    await decide(variance, 'zba')
    expect(await clocksOf(variance, XX_FINAL_APPROVAL_WINDOW.key)).toEqual([])
    expect(await petition(await decisionNodeOf(variance), '2027-04-20')).toEqual({
      ok: false,
      error: 'not_final',
    })
    expect(await projectFinality(handle.db, world.projectId, signal)).toBeNull()
  })

  it('starts the window on every application of the project from the final vote', async () => {
    const variance = await underReview(world.zbaTypeKey)
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(variance, 'zba')
    await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    for (const applicationId of [variance, plan]) {
      const started = await clocksOf(applicationId, XX_FINAL_APPROVAL_WINDOW.key)
      expect(started.map((c) => [c.startEvent, c.startDate])).toEqual([
        ['project_final_approval', PB_VOTE],
      ])
    }
    expect(await projectFinality(handle.db, world.projectId, signal)).toEqual({
      finalOn: PB_VOTE,
      finalReviewBoard: 'planning_board',
    })
    const [row] = await handle.db.select().from(projects).where(eq(projects.id, world.projectId))
    expect([row?.finalApprovalOn, row?.finalReviewBoard]).toEqual([PB_VOTE, 'planning_board'])
    expect(await petitionUntimely(await decisionNodeOf(variance), '2027-05-20')).toBe(false)
    expect(await petitionUntimely(await decisionNodeOf(plan), '2027-05-21')).toBe(false)
  })

  it('starts the denial window at once', async () => {
    const variance = await underReview(world.zbaTypeKey)
    await decide(variance, 'zba', {
      outcome: 'denied',
      reasonsForDisapproval: 'The hardship is self-created.',
    })
    const denial = await clocksOf(variance, XX_DENIAL_WINDOW.key)
    expect(denial.map((c) => [c.startEvent, c.startDate, c.status])).toEqual([
      ['board_vote', ZBA_VOTE, 'running'],
    ])
    expect(await clocksOf(variance, XX_FINAL_APPROVAL_WINDOW.key)).toEqual([])
  })

  it('offers the last approval checkbox on the decision form', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    const panel = await loadApplicationHearingsPanel(handle.db, world.staff, plan, signal)
    expect(panel?.noHearing?.offerFinalApproval).toBe(true)
    expect(START_EVENT_LABELS.project_final_approval).toBe(
      'Final municipal approval of the project',
    )
  })
})

describe('a route that depends on which board gave the final approval', () => {
  underPack(XX_PROJECT_FINALITY_BY_BOARD)

  it('takes the planning board route once the planning board gave the final approval', async () => {
    const variance = await underReview(world.zbaTypeKey)
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(variance, 'zba')
    await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    expect(await petitionUntimely(await decisionNodeOf(variance), '2027-06-07')).toBe(false)
    const planningWindow = await clocksOf(variance, XX_PB_FINAL_WINDOW.key)
    expect(planningWindow.map((c) => [c.startDate, c.status])).toEqual([[PB_VOTE, 'met']])
  })

  it('keeps the general route when another board gave the final approval', async () => {
    const variance = await underReview(world.zbaTypeKey)
    await decide(variance, 'zba', { finalMunicipalApproval: true })
    expect(await petitionUntimely(await decisionNodeOf(variance), '2027-05-25')).toBe(true)
  })

  it('refuses the planning board route before the project is final', async () => {
    const variance = await underReview(world.zbaTypeKey)
    await decide(variance, 'zba')
    expect(await petition(await decisionNodeOf(variance), '2027-04-20')).toEqual({
      ok: false,
      error: 'not_final',
    })
  })
})

describe('the NH pack', () => {
  beforeEach(async () => {
    handle = await makeTestDb()
    world = await setupBoardWorld(handle.db, { zbaMeetings: [ZBA_VOTE] })
  })

  it('offers no last approval checkbox and starts no new clocks', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const view = await loadHearingView(handle.db, world.staff, held.hearingId, signal)
    expect(view?.offerFinalApproval).toBe(false)
    const other = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-02')
    const otherBefore = await handle.db.select().from(clocks).where(eq(clocks.applicationId, other))
    const recorded = await recordDecision(
      handle.db,
      world.staff,
      {
        applicationId: held.applicationId,
        hearingId: held.hearingId,
        votedOn: d(ZBA_VOTE),
        outcome: 'approved',
        motion: 'Move to approve as presented.',
        votes: FIXTURE_VOTES,
        findings: 'The proposal meets each criterion of the ordinance.',
        finalMunicipalApproval: true,
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(recorded.ok).toBe(true)
    const otherAfter = await handle.db.select().from(clocks).where(eq(clocks.applicationId, other))
    expect(otherAfter).toEqual(otherBefore)
    const started = await handle.db.select().from(clocks)
    expect(started.filter((c) => c.startEvent === 'project_final_approval')).toEqual([])
    expect(await projectFinality(handle.db, world.projectId, signal)).toBeNull()
  })
})
