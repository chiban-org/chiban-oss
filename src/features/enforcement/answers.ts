import { civilDateSchema } from '@packs/nh/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, Tx } from '@/db/client'
import { documents, enforcementOrders, orderServiceRecipients } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { computeSubjectDue, type SubjectDue } from '@/features/clocks/subjectDue'
import { loadServiceState, orderRule, statusOf } from '@/features/enforcement/service'
import { PACK_COUNTING_CITATIONS, packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { err, ok, type Result } from '@/types/result'

export async function refreshAnswerDues(
  tx: Tx,
  orderId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  const [order] = await tx.select().from(enforcementOrders).where(eq(enforcementOrders.id, orderId))
  if (order === undefined) return
  const rule = orderRule(order)
  const pack = loadPack()
  const answerRule = ruleByKey(pack, rule.answerRuleKey)
  if (answerRule.kind !== 'clock') {
    throw new AppError(ErrorIds.ENF_INVARIANT, 'Answer rule is not a clock', {
      key: rule.answerRuleKey,
    })
  }
  const state = await loadServiceState(tx, orderId, signal)
  const status = statusOf(rule, state)
  for (const recipient of state.recipients) {
    const served = status.servedOn[recipient.id]
    if (served === undefined) continue
    const due = computeSubjectDue(answerRule, served, {
      holidays: packHolidayCalendar(),
      packVersion: pack.version,
      citations: PACK_COUNTING_CITATIONS,
    })
    await tx
      .update(orderServiceRecipients)
      .set({ answerDue: due })
      .where(eq(orderServiceRecipients.id, recipient.id))
  }
}

export function answerDueOf(row: { answerDue: unknown }): SubjectDue | null {
  return row.answerDue === null ? null : (row.answerDue as SubjectDue)
}

const AnswerSchema = z.object({
  recipientId: z.string().uuid(),
  answeredOn: civilDateSchema,
  documentId: z.string().uuid(),
})

export async function recordAnswer(
  db: Db,
  actor: Actor,
  input: z.input<typeof AnswerSchema>,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'invalid' | 'not_found' | 'document_invalid'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = AnswerSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    const [recipient] = await tx
      .select()
      .from(orderServiceRecipients)
      .where(eq(orderServiceRecipients.id, value.recipientId))
    if (recipient === undefined) return err('not_found')
    const [order] = await tx
      .select()
      .from(enforcementOrders)
      .where(eq(enforcementOrders.id, recipient.orderId))
      .for('update')
    if (order === undefined) return err('not_found')
    const [doc] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.id, value.documentId),
          eq(documents.recordKind, 'enforcement_case'),
          eq(documents.recordId, order.caseId),
        ),
      )
    if (doc === undefined) return err('document_invalid')
    await tx
      .update(orderServiceRecipients)
      .set({ answeredOn: value.answeredOn, answerDocumentId: value.documentId })
      .where(eq(orderServiceRecipients.id, value.recipientId))
    if (['issued', 'served', 'filed_with_court'].includes(order.status)) {
      await tx
        .update(enforcementOrders)
        .set({ status: 'answered', rowVersion: order.rowVersion + 1 })
        .where(eq(enforcementOrders.id, order.id))
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.answer_recorded',
        entityType: 'enforcement_order',
        entityId: order.id,
        after: { recipientId: value.recipientId, answeredOn: value.answeredOn },
      },
      signal,
    )
    return ok(undefined)
  })
}
