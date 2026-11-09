import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardDecisions, clocks, documents } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import { deliverDecisionLetter } from '@/features/decisions/letterDelivery'
import { noticeProofDocumentIds } from '@/features/documents/evidence'
import { isEvidenceKind } from '@/features/documents/types'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { approveLatestForPublic } from '@/features/renditions/publicApproval'
import { townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const FILING_CLOCK_KEY = 'nh.board.decision_filing'

export type FileError =
  | 'forbidden'
  | 'not_found'
  | 'already_filed'
  | 'future_date'
  | 'before_vote'
  | 'no_written_decision'
  | 'document_not_found'
  | 'wrong_document'

type FilingTx = Parameters<Parameters<typeof transactionResult>[1]>[0]

async function filingDue(
  tx: FilingTx,
  applicationId: string,
  votedOn: CivilDate,
): Promise<CivilDate> {
  const [clock] = await tx
    .select({ currentDue: clocks.currentDue })
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, FILING_CLOCK_KEY)))
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  if (clock !== undefined) return clock.currentDue as CivilDate
  const rule = ruleByKey(loadPack(), FILING_CLOCK_KEY)
  if (rule.kind !== 'clock') return votedOn
  return computeRuleDue(rule, { unit: 'business_days', value: 5 }, votedOn, packHolidayCalendar())
    .due
}

export async function fileDecision(
  db: Db,
  actor: Actor,
  input: { decisionId: string; filedOn: CivilDate; minutesDocumentId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ late: boolean }, FileError>> {
  signal.throwIfAborted()
  const allowed =
    (await hasCapability(db, actor.userId, 'board.record', signal)) &&
    (await hasCapability(db, actor.userId, 'document.publish', signal))
  if (!allowed) return err('forbidden')
  return await transactionResult<{ late: boolean }, FileError>(db, async (tx) => {
    const [decision] = await tx
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, input.decisionId))
      .for('update')
    if (decision === undefined) return err('not_found')
    if (decision.filedOn !== null) return err('already_filed')
    if (decision.writtenDecisionDocumentId === null) return err('no_written_decision')
    if (compareCivil(input.filedOn, await townToday(tx, now, signal)) > 0) return err('future_date')
    if (compareCivil(input.filedOn, decision.votedOn as CivilDate) < 0) return err('before_vote')
    const [minutes] = await tx
      .select({
        recordKind: documents.recordKind,
        recordId: documents.recordId,
        docKind: documents.docKind,
      })
      .from(documents)
      .where(eq(documents.id, input.minutesDocumentId))
    if (minutes?.recordKind !== 'application' || minutes.recordId !== decision.applicationId) {
      return err('document_not_found')
    }
    if (!isEvidenceKind(minutes.docKind)) return err('wrong_document')
    if ((await noticeProofDocumentIds(tx, [input.minutesDocumentId])).size > 0) {
      return err('wrong_document')
    }
    const due = await filingDue(tx, decision.applicationId, decision.votedOn as CivilDate)
    const late = compareCivil(input.filedOn, due) > 0
    await tx
      .update(documents)
      .set({ isPublic: true, publicChangedBy: actor.userId, publicChangedAt: now })
      .where(inArray(documents.id, [input.minutesDocumentId, decision.writtenDecisionDocumentId]))
    await approveLatestForPublic(
      tx,
      [input.minutesDocumentId, decision.writtenDecisionDocumentId],
      'Shown on the public site when the board decision was filed.',
    )
    await tx
      .update(boardDecisions)
      .set({ filedOn: input.filedOn, minutesDocumentId: input.minutesDocumentId })
      .where(eq(boardDecisions.id, decision.id))
    await markClockMet(tx, decision.applicationId, FILING_CLOCK_KEY, input.filedOn, signal)
    await deliverDecisionLetter(tx, { ...decision, filedOn: input.filedOn }, signal)
    await startClocksFor(
      tx,
      decision.applicationId,
      'decision_filed',
      input.filedOn,
      signal,
      undefined,
      undefined,
      { decisionFiledLate: late },
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'decision.file',
        entityType: 'application',
        entityId: decision.applicationId,
        after: { decisionId: decision.id, filedOn: input.filedOn, late },
      },
      signal,
    )
    return ok({ late })
  })
}
