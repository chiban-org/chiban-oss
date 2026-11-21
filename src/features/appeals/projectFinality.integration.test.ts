import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { clocks, projects } from '@/db/schema'
import { projectFinality } from '@/features/appeals/projectFinality'
import { START_EVENT_LABELS } from '@/features/clocks/explainClock'
import { recordDecision } from '@/features/decisions/recordDecision'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { loadHearingView } from '@/features/hearings/views'
import { BOARD_FIXTURE_NOW, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb } from '@/test/db'
import { FIXTURE_VOTES, heldZbaHearing } from '@/test/hearingFixtures'
import {
  XX_DENIAL_WINDOW,
  XX_FINAL_APPROVAL_WINDOW,
  XX_PB_FINAL_WINDOW,
  XX_PROJECT_FINALITY,
  XX_PROJECT_FINALITY_BY_BOARD,
} from '@/test/packs/xx/projectFinality'
import {
  clocksOf,
  d,
  decide,
  decisionNodeOf,
  dropAfterEach,
  finalityWorld as fw,
  PB_VOTE,
  petition,
  petitionUntimely,
  SUB_TYPE_KEY,
  signal,
  underPack,
  underReview,
  ZBA_VOTE,
} from '@/test/projectFinalityFixtures'

dropAfterEach()

describe('a pack whose approval windows wait for the last municipal approval', () => {
  underPack(XX_PROJECT_FINALITY)

  it('starts no approval window on an approval that is not the last one', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    await decide(variance, 'zba')
    expect(await clocksOf(variance, XX_FINAL_APPROVAL_WINDOW.key)).toEqual([])
    expect(await petition(await decisionNodeOf(variance), '2027-04-20')).toEqual({
      ok: false,
      error: 'not_final',
    })
    expect(await projectFinality(fw.handle.db, fw.world.projectId, signal)).toBeNull()
  })

  it('starts the window on every application of the project from the final vote', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(variance, 'zba')
    await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    for (const applicationId of [variance, plan]) {
      const started = await clocksOf(applicationId, XX_FINAL_APPROVAL_WINDOW.key)
      expect(started.map((c) => [c.startEvent, c.startDate])).toEqual([
        ['project_final_approval', PB_VOTE],
      ])
    }
    expect(await projectFinality(fw.handle.db, fw.world.projectId, signal)).toEqual({
      finalOn: PB_VOTE,
      finalReviewBoard: 'planning_board',
    })
    const [row] = await fw.handle.db
      .select()
      .from(projects)
      .where(eq(projects.id, fw.world.projectId))
    expect([row?.finalApprovalOn, row?.finalReviewBoard]).toEqual([PB_VOTE, 'planning_board'])
    expect(await petitionUntimely(await decisionNodeOf(variance), '2027-05-20')).toBe(false)
    expect(await petitionUntimely(await decisionNodeOf(plan), '2027-05-21')).toBe(false)
  })

  it('starts the denial window at once', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
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
    const panel = await loadApplicationHearingsPanel(fw.handle.db, fw.world.staff, plan, signal)
    expect(panel?.noHearing?.offerFinalApproval).toBe(true)
    expect(START_EVENT_LABELS.project_final_approval).toBe(
      'Final municipal approval of the project',
    )
  })
})

describe('a route that depends on which board gave the final approval', () => {
  underPack(XX_PROJECT_FINALITY_BY_BOARD)

  it('takes the planning board route once the planning board gave the final approval', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(variance, 'zba')
    await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    expect(await petitionUntimely(await decisionNodeOf(variance), '2027-06-07')).toBe(false)
    const planningWindow = await clocksOf(variance, XX_PB_FINAL_WINDOW.key)
    expect(planningWindow.map((c) => [c.startDate, c.status])).toEqual([[PB_VOTE, 'met']])
  })

  it('keeps the general route when another board gave the final approval', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    await decide(variance, 'zba', { finalMunicipalApproval: true })
    expect(await petitionUntimely(await decisionNodeOf(variance), '2027-05-25')).toBe(true)
  })

  it('refuses the planning board route before the project is final', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    await decide(variance, 'zba')
    expect(await petition(await decisionNodeOf(variance), '2027-04-20')).toEqual({
      ok: false,
      error: 'not_final',
    })
  })
})

describe('the NH pack', () => {
  beforeEach(async () => {
    fw.handle = await makeTestDb()
    fw.world = await setupBoardWorld(fw.handle.db, { zbaMeetings: [ZBA_VOTE] })
  })

  it('offers no last approval checkbox and starts no new clocks', async () => {
    const held = await heldZbaHearing(fw.handle.db, fw.world)
    const view = await loadHearingView(fw.handle.db, fw.world.staff, held.hearingId, signal)
    expect(view?.offerFinalApproval).toBe(false)
    const other = await submitBoardApplication(
      fw.handle.db,
      fw.world,
      fw.world.pbTypeKey,
      '2027-03-02',
    )
    const otherBefore = await fw.handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, other))
    const recorded = await recordDecision(
      fw.handle.db,
      fw.world.staff,
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
    const otherAfter = await fw.handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, other))
    expect(otherAfter).toEqual(otherBefore)
    const started = await fw.handle.db.select().from(clocks)
    expect(started.filter((c) => c.startEvent === 'project_final_approval')).toEqual([])
    expect(await projectFinality(fw.handle.db, fw.world.projectId, signal)).toBeNull()
  })
})
