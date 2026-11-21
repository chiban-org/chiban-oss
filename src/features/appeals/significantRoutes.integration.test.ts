import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { appealNodes, boardDecisions } from '@/db/schema'
import { recordDecision } from '@/features/decisions/recordDecision'
import { SIGNIFICANCE_QUESTION } from '@/features/decisions/significance'
import { loadApplicationHearingsPanel } from '@/features/hearings/applicationPanel'
import { loadHearingView } from '@/features/hearings/views'
import { activePack } from '@/features/packs/registry'
import { BOARD_FIXTURE_NOW, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb } from '@/test/db'
import { FIXTURE_VOTES, heldZbaHearing } from '@/test/hearingFixtures'
import {
  XX_BOARD_COURT,
  XX_COURT_AFTER_RECONSIDERATION,
  XX_GENERIC_DENIAL,
  XX_SIGNIFICANT_AFTER_RECONSIDERATION,
  XX_SIGNIFICANT_COURT,
  XX_SIGNIFICANT_DENIAL,
  XX_SIGNIFICANT_HELP,
  XX_SIGNIFICANT_ROUTES,
  XX_SIGNIFICANT_WINDOWS,
} from '@/test/packs/xx/significance'
import {
  addStep,
  clocksOf,
  d,
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
  ZBA_VOTE,
} from '@/test/projectFinalityFixtures'

dropAfterEach()

async function significantOf(decisionId: string): Promise<boolean | null | undefined> {
  const [row] = await fw.handle.db
    .select({ significant: boardDecisions.significant })
    .from(boardDecisions)
    .where(eq(boardDecisions.id, decisionId))
  return row?.significant
}

async function statusOf(applicationId: string, ruleKey: string): Promise<string[]> {
  return (await clocksOf(applicationId, ruleKey)).map((c) => c.status)
}

async function windowLabelOf(applicationId: string): Promise<string | undefined> {
  const panel = await loadApplicationHearingsPanel(
    fw.handle.db,
    fw.world.staff,
    applicationId,
    signal,
  )
  return panel?.graph.find((n) => n.parentId === null)?.window?.label
}

async function reconsidered(applicationId: string): Promise<string> {
  const motion = await addStep(
    await decisionNodeOf(applicationId),
    'rehearing_motion',
    '2027-05-03',
  )
  if (!motion.ok) throw new AppError(ErrorIds.DB_INVARIANT, `motion: ${motion.error}`)
  const outcome = await addStep(motion.value.nodeId, 'rehearing_outcome', '2027-05-20', {
    outcome: 'denied',
  })
  if (!outcome.ok) throw new AppError(ErrorIds.DB_INVARIANT, `outcome: ${outcome.error}`)
  return outcome.value.nodeId
}

describe('appeal routes for significant land use decisions', () => {
  underPack(XX_SIGNIFICANT_ROUTES)

  it('takes the significant route for a significant decision', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    const decisionId = await decide(plan, 'planning_board', { significant: true })
    expect(await significantOf(decisionId)).toBe(true)
    expect(await windowLabelOf(plan)).toBe(XX_SIGNIFICANT_COURT.label)
    expect(await petitionUntimely(await decisionNodeOf(plan), '2027-05-18')).toBe(true)
    expect(await statusOf(plan, XX_SIGNIFICANT_COURT.key)).toEqual(['met'])
    expect(await statusOf(plan, XX_BOARD_COURT.key)).toEqual(['running'])
  })

  it('takes the generic route for a decision that is not significant', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    const decisionId = await decide(plan, 'planning_board', { significant: false })
    expect(await significantOf(decisionId)).toBe(false)
    expect(await windowLabelOf(plan)).toBe(XX_BOARD_COURT.label)
    expect(await petitionUntimely(await decisionNodeOf(plan), '2027-05-18')).toBe(false)
    expect(await statusOf(plan, XX_BOARD_COURT.key)).toEqual(['met'])
  })

  it("reads the reconsidered decision's flag after a reconsideration", async () => {
    const significant = await underReview(SUB_TYPE_KEY)
    await decide(significant, 'planning_board', { significant: true })
    const ordinary = await underReview(SUB_TYPE_KEY)
    await decide(ordinary, 'planning_board', { significant: false })
    expect(await petitionUntimely(await reconsidered(significant), '2027-06-09')).toBe(true)
    expect(await petitionUntimely(await reconsidered(ordinary), '2027-06-09')).toBe(false)
    expect(await statusOf(significant, XX_SIGNIFICANT_AFTER_RECONSIDERATION.key)).toContain('met')
    expect(await statusOf(ordinary, XX_COURT_AFTER_RECONSIDERATION.key)).toContain('met')
  })

  it('refuses a decision of the classification recorded without the flag', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    expect(await tryDecide(plan, 'planning_board')).toEqual({
      ok: false,
      error: { missingFields: ['significant'] },
    })
  })

  it('asks the question with the pack help on the decision form', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    const panel = await loadApplicationHearingsPanel(fw.handle.db, fw.world.staff, plan, signal)
    expect(panel?.noHearing?.significanceQuestion).toEqual({ help: XX_SIGNIFICANT_HELP })
    expect(SIGNIFICANCE_QUESTION).toBe(
      'Is this a significant land use decision (large buildings, more than 3 acres, or 10 or more lots)?',
    )
  })

  it('does not ask or store the flag for another classification', async () => {
    const variance = await underReview(fw.world.zbaTypeKey)
    const panel = await loadApplicationHearingsPanel(fw.handle.db, fw.world.staff, variance, signal)
    expect(panel?.noHearing?.significanceQuestion).toBeNull()
    const decisionId = await decide(variance, 'zba', { significant: true })
    expect(await significantOf(decisionId)).toBeNull()
    const [node] = await fw.handle.db
      .select({ kind: appealNodes.kind })
      .from(appealNodes)
      .where(eq(appealNodes.decisionId, decisionId))
    expect(node?.kind).toBe('zba_decision')
  })

  it('starts the windows of a vote on the same date', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(plan, 'planning_board', { significant: true })
    const started = await clocksOf(plan, XX_BOARD_COURT.key)
    expect(started.map((c) => c.startDate)).toEqual([PB_VOTE])
  })
})

describe('the NH pack', () => {
  beforeEach(async () => {
    fw.handle = await makeTestDb()
    fw.world = await setupBoardWorld(fw.handle.db, { zbaMeetings: [ZBA_VOTE] })
  })

  it('asks no significance question, stores no flag and has no significant route', async () => {
    expect(activePack().appealRoutes.some((r) => r.when?.significant !== undefined)).toBe(false)
    expect(activePack().labels.significantDecisionHelp).toBeNull()
    const held = await heldZbaHearing(fw.handle.db, fw.world)
    const view = await loadHearingView(fw.handle.db, fw.world.staff, held.hearingId, signal)
    expect(view?.significanceQuestion).toBeNull()
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
        significant: true,
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    if (!recorded.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'decision refused')
    expect(await significantOf(recorded.value.decisionId)).toBeNull()
  })
})

const DENIAL = {
  outcome: 'denied' as const,
  reasonsForDisapproval: 'The plan fails the road standard.',
}

async function startedDenialWindows(applicationId: string): Promise<string[]> {
  const started: string[] = []
  for (const rule of [XX_GENERIC_DENIAL, XX_SIGNIFICANT_DENIAL]) {
    for (const clock of await clocksOf(applicationId, rule.key))
      started.push(`${rule.key} ${clock.startDate} ${clock.status}`)
  }
  return started
}

describe('denial windows that depend on a significant land use decision', () => {
  underPack(XX_SIGNIFICANT_WINDOWS)

  it('starts only the significant window on a significant denial', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(plan, 'planning_board', { ...DENIAL, significant: true })
    expect(await startedDenialWindows(plan)).toEqual([
      `${XX_SIGNIFICANT_DENIAL.key} ${PB_VOTE} running`,
    ])
  })

  it('starts only the generic window on a denial that is not significant', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(plan, 'planning_board', { ...DENIAL, significant: false })
    expect(await startedDenialWindows(plan)).toEqual([
      `${XX_GENERIC_DENIAL.key} ${PB_VOTE} running`,
    ])
  })

  it('starts neither window on an approval', async () => {
    const plan = await underReview(SUB_TYPE_KEY)
    await decide(plan, 'planning_board', { significant: true })
    expect(await startedDenialWindows(plan)).toEqual([])
  })
})
