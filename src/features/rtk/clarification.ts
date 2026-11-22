import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { rtkRequests } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { civilDateSchema } from '@/features/packs/schema'
import { townToday } from '@/features/town/today'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const AnswerSchema = z.object({
  requestId: z.string().uuid(),
  answer: z.string().trim().min(1).max(5000),
  answeredOn: civilDateSchema,
})

export type ClarificationAnswerError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'no_clarification_question'
  | 'before_acknowledgement'
  | 'future_date'

export async function recordClarificationAnswer(
  db: Db,
  actor: Actor,
  input: z.input<typeof AnswerSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, ClarificationAnswerError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = AnswerSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult<void, ClarificationAnswerError>(db, async (tx) => {
    const [request] = await tx
      .select()
      .from(rtkRequests)
      .where(eq(rtkRequests.id, value.requestId))
      .for('update')
    if (request === undefined) return err('not_found')
    if (request.clarificationQuestion === null) return err('no_clarification_question')
    const acknowledgedOn = request.acknowledgedOn as CivilDate | null
    if (acknowledgedOn !== null && daysBetween(acknowledgedOn, value.answeredOn) < 0) {
      return err('before_acknowledgement')
    }
    const today = await townToday(tx, now, signal)
    if (daysBetween(today, value.answeredOn) > 0) return err('future_date')
    await tx
      .update(rtkRequests)
      .set({
        clarificationAnswer: value.answer,
        clarificationAnsweredOn: value.answeredOn,
        rowVersion: request.rowVersion + 1,
      })
      .where(eq(rtkRequests.id, request.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rtk.clarification_answered',
        entityType: 'rtk_request',
        entityId: request.id,
        before: {
          answer: request.clarificationAnswer,
          answeredOn: request.clarificationAnsweredOn,
        },
        after: { answer: value.answer, answeredOn: value.answeredOn },
      },
      signal,
    )
    return ok(undefined)
  })
}
