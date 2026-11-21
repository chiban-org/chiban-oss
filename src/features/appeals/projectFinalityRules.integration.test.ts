import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { appealNodes, applications, auditLog } from '@/db/schema'
import { projectFinality } from '@/features/appeals/projectFinality'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { formatCivilDate } from '@/lib/formatDate'
import { setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb } from '@/test/db'
import {
  XX_DENIAL_WINDOW,
  XX_FINAL_APPROVAL_WINDOW,
  XX_PROJECT_FINALITY,
  XX_PROJECT_FINALITY_BY_OUTCOME,
} from '@/test/packs/xx/projectFinality'
import { XX_OPTIONAL_HEARING, XX_PB_SUBDIVISION_KEY } from '@/test/packs/xx/variants'
import {
  addStep,
  clocksOf,
  decide,
  decisionNodeOf,
  dropAfterEach,
  finalityWorld as fw,
  PB_VOTE,
  petitionUntimely,
  SUB_TYPE_KEY,
  signal,
  tryDecide,
  underPack,
  underReview,
} from '@/test/projectFinalityFixtures'
import { err } from '@/types/result'

const AWAITING_FINAL_APPROVAL = 'after the project has its last municipal approval'
const DENIED = {
  outcome: 'denied' as const,
  reasonsForDisapproval: 'The hardship is self-created.',
}

async function finalityAudits() {
  return await fw.handle.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, 'project.final_approval'), eq(auditLog.entityType, 'project')))
}

async function appealNode(applicationId: string | null): Promise<string> {
  const [row] = await fw.handle.db
    .insert(appealNodes)
    .values({
      kind: 'zba_appeal',
      applicationId,
      occurredOn: '2027-04-01',
      createdBy: fw.world.staff.userId,
    })
    .returning({ id: appealNodes.id })
  return row?.id ?? ''
}

async function windowShown(applicationId: string) {
  const panel = await loadApplicationHearingsPanel(
    fw.handle.db,
    fw.world.staff,
    applicationId,
    signal,
  )
  return panel?.graph[0]?.window ?? null
}

dropAfterEach()

describe('declaring the last approval', () => {
  underPack(XX_PROJECT_FINALITY)

  it('starts no approval window on a denied application of the project', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(variance, 'zba', DENIED)
    await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    expect(await clocksOf(variance, XX_FINAL_APPROVAL_WINDOW.key)).toEqual([])
    expect((await clocksOf(plan, XX_FINAL_APPROVAL_WINDOW.key)).length).toBe(1)
  })

  it('refuses a second declaration and records nothing for it', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    expect(await tryDecide(variance, 'zba', { finalMunicipalApproval: true })).toEqual(
      err('already_final'),
    )
    const [row] = await fw.handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, variance))
    expect(row?.state).toBe('under_review')
    expect(await projectFinality(fw.handle.db, fw.world.projectId, signal)).toEqual({
      finalOn: PB_VOTE,
      finalReviewBoard: 'planning_board',
    })
  })

  it('writes an audit entry on the project', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    const decisionId = await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    const audits = await finalityAudits()
    expect(audits.map((a) => [a.entityId, a.after])).toEqual([
      [
        fw.world.projectId,
        { finalApprovalOn: PB_VOTE, finalReviewBoard: 'planning_board', decisionId },
      ],
    ])
  })

  it('declares nothing on a denial sent with the flag', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    await decide(variance, 'zba', { ...DENIED, finalMunicipalApproval: true })
    expect(await projectFinality(fw.handle.db, fw.world.projectId, signal)).toBeNull()
    expect(await finalityAudits()).toEqual([])
  })

  it('shows the same due date on the appeal graph as the timeliness check', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(variance, 'zba')
    expect((await windowShown(variance))?.dueText).toBe(AWAITING_FINAL_APPROVAL)
    await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    const [clock] = await clocksOf(variance, XX_FINAL_APPROVAL_WINDOW.key)
    expect((await windowShown(variance))?.dueText).toBe(formatCivilDate(clock?.currentDue ?? ''))
  })
})

describe('board decisions on an appeal', () => {
  underPack(XX_PROJECT_FINALITY)

  it('declares the last approval from the appeal step', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    const added = await addStep(await appealNode(variance), 'zba_decision', '2027-04-20', {
      outcome: 'approved',
      finalMunicipalApproval: true,
    })
    expect(added.ok).toBe(true)
    expect(await projectFinality(fw.handle.db, fw.world.projectId, signal)).toEqual({
      finalOn: '2027-04-20',
      finalReviewBoard: 'zba',
    })
    const started = await clocksOf(variance, XX_FINAL_APPROVAL_WINDOW.key)
    expect(started.map((c) => [c.startEvent, c.startDate])).toEqual([
      ['project_final_approval', '2027-04-20'],
    ])
    const audits = await finalityAudits()
    expect(audits[0]?.after).toEqual({
      finalApprovalOn: '2027-04-20',
      finalReviewBoard: 'zba',
      decisionId: null,
      appealNodeId: added.ok ? added.value.nodeId : '',
    })
  })

  it('counts the window from the decision when the appeal has no application', async () => {
    const timely = await addStep(await appealNode(null), 'zba_decision', '2027-04-20', {
      outcome: 'approved',
    })
    const late = await addStep(await appealNode(null), 'zba_decision', '2027-04-20', {
      outcome: 'approved',
    })
    if (!timely.ok || !late.ok)
      throw new AppError(ErrorIds.DB_INVARIANT, 'appeal decisions not recorded')
    expect(await petitionUntimely(timely.value.nodeId, '2027-05-10')).toBe(false)
    expect(await petitionUntimely(late.value.nodeId, '2027-05-25')).toBe(true)
  })
})

describe('a pack that routes approvals and denials apart', () => {
  underPack(XX_PROJECT_FINALITY_BY_OUTCOME)

  it('judges a petition on a denial against the denial window', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(variance, 'zba', DENIED)
    await decide(plan, 'planning_board', { finalMunicipalApproval: true })
    expect((await windowShown(variance))?.label).toBe(XX_DENIAL_WINDOW.label)
    expect(await petitionUntimely(await decisionNodeOf(variance), '2027-05-25')).toBe(true)
    const denial = await clocksOf(variance, XX_DENIAL_WINDOW.key)
    expect(denial.map((c) => c.status)).toEqual(['met'])
  })
})

describe('the decision form without a pack rule on the last approval', () => {
  it('offers no checkbox under a pack with no such rule', async () => {
    fw.handle = await makeTestDb()
    const { setActivePackForTest } = await import('@/features/packs/registry')
    setActivePackForTest(XX_OPTIONAL_HEARING)
    try {
      fw.world = await setupBoardWorld(fw.handle.db, {
        zbaMeetings: ['2027-04-15'],
        pack: XX_OPTIONAL_HEARING,
        classificationKey: XX_PB_SUBDIVISION_KEY,
      })
      const plan = await underReview(fw.world.zbaTypeKey)
      const panel = await loadApplicationHearingsPanel(fw.handle.db, fw.world.staff, plan, signal)
      expect(panel?.noHearing?.offerFinalApproval).toBe(false)
    } finally {
      setActivePackForTest(null)
    }
  })

  it('offers no decision without a hearing under NH, so no checkbox', async () => {
    fw.handle = await makeTestDb()
    fw.world = await setupBoardWorld(fw.handle.db, { zbaMeetings: ['2027-04-15'] })
    const variance = await submitBoardApplication(
      fw.handle.db,
      fw.world,
      fw.world.zbaTypeKey,
      '2027-03-02',
    )
    const panel = await loadApplicationHearingsPanel(fw.handle.db, fw.world.staff, variance, signal)
    expect(panel?.noHearing).toBeNull()
  })
})
