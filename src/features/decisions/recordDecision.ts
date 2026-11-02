import type { DecisionOutcome } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import {
  applicationConditions,
  applications,
  boardDecisions,
  type DecisionCondition,
  type DecisionVotes,
  hearings,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { recordDecisionNode } from '@/features/appeals/graph'
import { loadApplicationContext } from '@/features/applications/context'
import { transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import { inputProblem } from '@/features/decisions/decisionInputProblems'
import type { GateResult } from '@/features/gates/evaluateGates'
import { isAfterTownToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface RecordDecisionInput {
  applicationId: string
  hearingId: string
  votedOn: CivilDate
  outcome: DecisionOutcome
  motion: string
  votes: DecisionVotes
  findings: string
  conditions?: DecisionCondition[]
  reasonsForDisapproval?: string
}

export type DecisionError =
  | 'forbidden'
  | 'not_found'
  | 'hearing_not_held'
  | 'votes_inconsistent'
  | 'invalid_state'
  | 'before_meeting'
  | 'future_date'
  | { notSeated: string[] }
  | { missingFields: string[] }
  | { gateBlocked: GateResult[] }

const DECISION_CLOCKS = ['nh.pb.decision', 'nh.zba.decision']
const DENIAL_OUTCOMES: DecisionOutcome[] = ['denied', 'rehearing_denied']

async function applyConditions(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  conditions: DecisionCondition[],
): Promise<void> {
  for (const c of conditions) {
    await tx.insert(applicationConditions).values({
      applicationId,
      code: c.code,
      textSnapshot: c.text,
      blocksIssuance: c.precedent,
      changedBy: actor.userId,
    })
  }
}

function voteTiming(
  hearing: { status: string; heldOn: string | null },
  votedOn: CivilDate,
): 'hearing_not_held' | 'before_meeting' | null {
  if (hearing.status !== 'held') return 'hearing_not_held'
  if (hearing.heldOn !== null && compareCivil(votedOn, hearing.heldOn as CivilDate) < 0) {
    return 'before_meeting'
  }
  return null
}

export async function recordDecision(
  db: Db,
  actor: Actor,
  input: RecordDecisionInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ decisionId: string }, DecisionError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  if (await isAfterTownToday(db, input.votedOn, now, signal)) return err('future_date')
  return await transactionResult<{ decisionId: string }, DecisionError>(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const [hearing] = await tx.select().from(hearings).where(eq(hearings.id, input.hearingId))
    if (hearing === undefined || hearing.applicationId !== input.applicationId)
      return err('not_found')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const timing = voteTiming(hearing, input.votedOn)
    if (timing !== null) return err(timing)
    const [already] = await tx
      .select({ id: boardDecisions.id })
      .from(boardDecisions)
      .where(eq(boardDecisions.hearingId, hearing.id))
    if (already !== undefined) return err('invalid_state')
    const problem = await inputProblem(tx, boardOfApplication(app), input)
    if (problem !== null) return err(problem)
    const moved = await transitionApplication(
      tx,
      actor,
      {
        applicationId: app.id,
        to: DENIAL_OUTCOMES.includes(input.outcome) ? 'denied' : 'decided',
        expectedRowVersion: app.rowVersion,
        onDate: input.votedOn,
      },
      signal,
    )
    if (!moved.ok) {
      const error = moved.error
      if (typeof error !== 'string') return err(error)
      return err(error === 'forbidden' || error === 'not_found' ? error : 'invalid_state')
    }
    for (const key of DECISION_CLOCKS) await markClockMet(tx, app.id, key, input.votedOn, signal)
    const [row] = await tx
      .insert(boardDecisions)
      .values({
        applicationId: app.id,
        hearingId: hearing.id,
        meetingId: hearing.meetingId,
        votedOn: input.votedOn,
        outcome: input.outcome,
        motion: input.motion,
        votes: input.votes,
        findings: input.findings.trim(),
        conditions: input.conditions ?? [],
        reasonsForDisapproval: input.reasonsForDisapproval?.trim() ?? null,
        recordedBy: actor.userId,
      })
      .returning({ id: boardDecisions.id })
    await applyConditions(tx, actor, app.id, input.conditions ?? [])
    const board = boardOfApplication(app)
    if (board !== null && !input.outcome.startsWith('rehearing')) {
      await recordDecisionNode(tx, {
        applicationId: app.id,
        decisionId: row?.id ?? '',
        board,
        outcome: input.outcome,
        occurredOn: input.votedOn,
        createdBy: actor.userId,
      })
    }
    await startClocksFor(tx, app.id, 'board_vote', input.votedOn, signal, undefined, undefined, {
      outcome: input.outcome,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'decision.record',
        entityType: 'application',
        entityId: app.id,
        after: { decisionId: row?.id, outcome: input.outcome, votedOn: input.votedOn },
      },
      signal,
    )
    return ok({ decisionId: row?.id ?? '' })
  })
}
