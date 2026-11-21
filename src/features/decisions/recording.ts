import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { applications, boardDecisions, clocks, decisionRecordings, documents } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { startClocksFor } from '@/features/clocks/startClocks'
import { classificationOfApplication } from '@/features/decisions/hearingOptional'
import { recordingIsRequired, type VarianceValidity } from '@/features/decisions/recordingRequired'
import { loadPack } from '@/features/packs/loadPack'
import { townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const APPROVING = ['approved', 'approved_with_conditions']
const OPEN_OR_LAPSED = ['running', 'overdue', 'lapsed'] as const

export type FinalWrittenApprovalError =
  | 'forbidden'
  | 'not_found'
  | 'already_recorded'
  | 'not_approving'
  | 'future_date'
  | 'before_vote'

export type DecisionRecordingError =
  | 'forbidden'
  | 'not_found'
  | 'already_recorded'
  | 'no_final_written_approval'
  | 'before_approval'
  | 'future_date'
  | 'after_period'
  | 'document_not_found'

export function voidRuleKeys(): string[] {
  return loadPack()
    .rules.filter((r) => r.kind === 'clock' && r.consequence.kind === 'void_unless_recorded')
    .map((r) => r.key)
}

async function lockedDecision(tx: Tx, decisionId: string) {
  const [found] = await tx
    .select({ applicationId: boardDecisions.applicationId })
    .from(boardDecisions)
    .where(eq(boardDecisions.id, decisionId))
  if (found === undefined) return null
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, found.applicationId))
    .for('update')
  const [decision] = await tx
    .select()
    .from(boardDecisions)
    .where(eq(boardDecisions.id, decisionId))
    .for('update')
  return decision ?? null
}

async function recordingRequiredFor(
  tx: Tx,
  applicationId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const app = await loadApplicationContext(tx, applicationId, signal)
  return app !== null && recordingIsRequired(classificationOfApplication(app))
}

export async function recordFinalWrittenApproval(
  db: Db,
  actor: Actor,
  input: { decisionId: string; approvedOn: CivilDate },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, FinalWrittenApprovalError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<void, FinalWrittenApprovalError>(db, async (tx) => {
    const decision = await lockedDecision(tx, input.decisionId)
    if (decision === null) return err('not_found')
    if (!(await recordingRequiredFor(tx, decision.applicationId, signal))) return err('not_found')
    if (!APPROVING.includes(decision.outcome)) return err('not_approving')
    if (decision.finalWrittenApprovalOn !== null) return err('already_recorded')
    if (compareCivil(input.approvedOn, await townToday(tx, now, signal)) > 0) {
      return err('future_date')
    }
    if (compareCivil(input.approvedOn, decision.votedOn as CivilDate) < 0) return err('before_vote')
    await tx
      .update(boardDecisions)
      .set({ finalWrittenApprovalOn: input.approvedOn })
      .where(eq(boardDecisions.id, decision.id))
    await startClocksFor(
      tx,
      decision.applicationId,
      'final_written_approval',
      input.approvedOn,
      signal,
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'decision.final_written_approval',
        entityType: 'application',
        entityId: decision.applicationId,
        after: { decisionId: decision.id, approvedOn: input.approvedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}

async function voidClockOf(tx: Tx, applicationId: string, approvedOn: CivilDate) {
  const keys = voidRuleKeys()
  if (keys.length === 0) return null
  const [clock] = await tx
    .select()
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        inArray(clocks.ruleKey, keys),
        eq(clocks.startDate, approvedOn),
        inArray(clocks.status, [...OPEN_OR_LAPSED]),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  return clock ?? null
}

async function meetVoidClock(tx: Tx, clockId: string, recordedOn: CivilDate): Promise<void> {
  await tx
    .update(clocks)
    .set({ status: 'met', metOn: recordedOn })
    .where(and(eq(clocks.id, clockId), inArray(clocks.status, [...OPEN_OR_LAPSED])))
}

export async function recordDecisionRecording(
  db: Db,
  actor: Actor,
  input: {
    decisionId: string
    registry: string
    book: string
    page: string
    recordedOn: CivilDate
    certificateDocumentId: string
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, DecisionRecordingError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<void, DecisionRecordingError>(db, async (tx) => {
    const decision = await lockedDecision(tx, input.decisionId)
    if (decision === null) return err('not_found')
    const [existing] = await tx
      .select({ id: decisionRecordings.decisionId })
      .from(decisionRecordings)
      .where(eq(decisionRecordings.decisionId, decision.id))
    if (existing !== undefined) return err('already_recorded')
    const approvedOn = decision.finalWrittenApprovalOn as CivilDate | null
    if (approvedOn === null) return err('no_final_written_approval')
    if (compareCivil(input.recordedOn, approvedOn) < 0) return err('before_approval')
    if (compareCivil(input.recordedOn, await townToday(tx, now, signal)) > 0) {
      return err('future_date')
    }
    const [doc] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, input.certificateDocumentId),
          eq(documents.recordKind, 'application'),
          eq(documents.recordId, decision.applicationId),
        ),
      )
    if (doc === undefined) return err('document_not_found')
    const clock = await voidClockOf(tx, decision.applicationId, approvedOn)
    if (clock !== null && compareCivil(input.recordedOn, clock.currentDue as CivilDate) > 0) {
      return err('after_period')
    }
    await tx.insert(decisionRecordings).values({
      decisionId: decision.id,
      registry: input.registry,
      book: input.book,
      page: input.page,
      recordedOn: input.recordedOn,
      certificateDocumentId: doc.id,
      recordedBy: actor.userId,
    })
    if (clock !== null) await meetVoidClock(tx, clock.id, input.recordedOn)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'decision.recorded_at_registry',
        entityType: 'application',
        entityId: decision.applicationId,
        after: {
          decisionId: decision.id,
          registry: input.registry,
          book: input.book,
          page: input.page,
          recordedOn: input.recordedOn,
        },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function varianceValidity(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<VarianceValidity> {
  signal.throwIfAborted()
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null || !recordingIsRequired(classificationOfApplication(app))) return 'not_required'
  const [decision] = await db
    .select({ id: boardDecisions.id, outcome: boardDecisions.outcome })
    .from(boardDecisions)
    .where(eq(boardDecisions.applicationId, applicationId))
    .orderBy(desc(boardDecisions.votedOn), desc(boardDecisions.recordedAt))
    .limit(1)
  if (decision === undefined || !APPROVING.includes(decision.outcome)) return 'not_required'
  const [recording] = await db
    .select({ id: decisionRecordings.decisionId })
    .from(decisionRecordings)
    .where(eq(decisionRecordings.decisionId, decision.id))
  if (recording !== undefined) return 'recorded'
  const keys = voidRuleKeys()
  if (keys.length === 0) return 'pending_recording'
  const [lapsed] = await db
    .select({ id: clocks.id })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        inArray(clocks.ruleKey, keys),
        eq(clocks.status, 'lapsed'),
      ),
    )
    .limit(1)
  return lapsed === undefined ? 'pending_recording' : 'void'
}
