import { civilDateSchema } from '@packs/nh/schema'
import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { rtkRequests, rtkWithholdings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { fileRequestLetter } from '@/features/rtk/requestLetter'
import type { ObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const DenySchema = z.object({
  requestId: z.string().uuid(),
  deniedOn: civilDateSchema,
})

export type DenyError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'not_awaiting_decision'
  | 'future_date'
  | 'before_statement'
  | 'withholding_required'

export interface DenyContext {
  db: Db
  store: ObjectStore
  actor: Actor
  signal: AbortSignal
  now?: Date
}

export async function denyRequest(
  context: DenyContext,
  input: z.input<typeof DenySchema>,
): Promise<Result<{ letterDocumentId: string }, DenyError>> {
  const { db, store, actor, signal, now = new Date() } = context
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'rtk.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = DenySchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult<{ letterDocumentId: string }, DenyError>(db, async (tx) => {
    const [request] = await tx
      .select()
      .from(rtkRequests)
      .where(eq(rtkRequests.id, value.requestId))
      .for('update')
    if (request === undefined) return err('not_found')
    if (request.status !== 'awaiting_decision') return err('not_awaiting_decision')
    const today = await townToday(tx, now, signal)
    if (daysBetween(today, value.deniedOn) > 0) return err('future_date')
    const statedOn = (request.firstResponseOn ?? request.receivedOn) as CivilDate
    if (daysBetween(statedOn, value.deniedOn) < 0) return err('before_statement')
    const [withheld] = await tx
      .select({ n: count() })
      .from(rtkWithholdings)
      .where(eq(rtkWithholdings.requestId, request.id))
    if ((withheld?.n ?? 0) === 0) return err('withholding_required')
    await tx
      .update(rtkRequests)
      .set({
        status: 'responded',
        deniedOn: value.deniedOn,
        openDueOn: null,
        rowVersion: request.rowVersion + 1,
      })
      .where(eq(rtkRequests.id, request.id))
    const letterDocumentId = await fileRequestLetter(
      tx,
      { store, actor, signal },
      {
        requestId: request.id,
        title: `Denial of request ${request.number}`,
        filename: `${request.number}-denial.pdf`,
      },
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rtk.denied',
        entityType: 'rtk_request',
        entityId: request.id,
        before: { status: request.status },
        after: { status: 'responded', deniedOn: value.deniedOn },
      },
      signal,
    )
    return ok({ letterDocumentId })
  })
}
