import { eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import {
  applicationConditions,
  applications,
  boardDecisions,
  type DecisionCondition,
  type DecisionVotes,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { recordDecisionNode } from '@/features/appeals/graph'
import { declareFinalApproval } from '@/features/appeals/projectFinality'
import { loadApplicationContext } from '@/features/applications/context'
import { transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import { boardDecisionClockKeys } from '@/features/decisions/decisionClocks'
import { inputProblem } from '@/features/decisions/decisionInputProblems'
import { resolveVenue } from '@/features/decisions/decisionVenue'
import { planDeliveries } from '@/features/decisions/delivery'
import { classificationOfApplication } from '@/features/decisions/hearingOptional'
import { storedSignificance } from '@/features/decisions/significance'
import type { GateResult } from '@/features/gates/evaluateGates'
import type { DecisionOutcome } from '@/features/packs/schema'
import { isAfterTownToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface RecordDecisionInput {
  applicationId: string
  hearingId: string | null
  meetingId?: string
  votedOn: CivilDate
  outcome: DecisionOutcome
  motion: string
  votes: DecisionVotes
  findings: string
  conditions?: DecisionCondition[]
  reasonsForDisapproval?: string
  finalMunicipalApproval?: boolean
  significant?: boolean
}

export type DecisionError =
  | 'forbidden'
  | 'not_found'
  | 'hearing_not_held'
  | 'hearing_required'
  | 'meeting_required'
  | 'votes_inconsistent'
  | 'invalid_state'
  | 'before_meeting'
  | 'future_date'
  | 'already_final'
  | 'before_receipt'
  | 'before_acceptance'
  | 'hearing_scheduled'
  | { notSeated: string[] }
  | { missingFields: string[] }
  | { gateBlocked: GateResult[] }

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
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const venue = await resolveVenue(tx, app, input)
    if (!venue.ok) return err(venue.error)
    const { hearingId, meetingId, boardId } = venue.value
    const classification = classificationOfApplication(app)
    const seatingBoardId = boardOfApplication(app) === null ? null : boardId
    const problem = await inputProblem(tx, seatingBoardId, input, classification)
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
    for (const key of boardDecisionClockKeys())
      await markClockMet(tx, app.id, key, input.votedOn, signal)
    const [row] = await tx
      .insert(boardDecisions)
      .values({
        applicationId: app.id,
        hearingId,
        meetingId,
        votedOn: input.votedOn,
        outcome: input.outcome,
        motion: input.motion,
        votes: input.votes,
        findings: input.findings.trim(),
        conditions: input.conditions ?? [],
        reasonsForDisapproval: input.reasonsForDisapproval?.trim() ?? null,
        significant: storedSignificance(classification, input.outcome, input.significant),
        recordedBy: actor.userId,
      })
      .returning({ id: boardDecisions.id })
    await applyConditions(tx, actor, app.id, input.conditions ?? [])
    const boardKind = boardOfApplication(app)
    if (boardKind !== null && !input.outcome.startsWith('rehearing')) {
      await recordDecisionNode(tx, {
        applicationId: app.id,
        decisionId: row?.id ?? '',
        boardKind,
        outcome: input.outcome,
        occurredOn: input.votedOn,
        createdBy: actor.userId,
      })
    }
    await startClocksFor(tx, app.id, 'board_vote', input.votedOn, signal, undefined, undefined, {
      outcome: input.outcome,
    })
    const declared = await declareFinalApproval(
      tx,
      {
        declared: input.finalMunicipalApproval,
        applicationId: app.id,
        outcome: input.outcome,
        votedOn: input.votedOn,
        boardKind,
        actorUserId: actor.userId,
        decisionId: row?.id ?? null,
      },
      signal,
    )
    if (!declared.ok) return err(declared.error)
    await planDeliveries(tx, { decisionId: row?.id ?? '' }, signal)
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
