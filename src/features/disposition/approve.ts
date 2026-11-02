import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { dispositionBatches } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

const BatchSchema = z.object({ batchId: z.string().uuid() })

export async function approveDisposition(
  db: Db,
  actor: Actor,
  input: { batchId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'invalid' | 'not_proposed'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'disposition.approve', signal))) {
    return err('forbidden')
  }
  const parsed = BatchSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  return await transactionResult(db, async (tx) => {
    const changed = await tx
      .update(dispositionBatches)
      .set({ status: 'approved', approvedBy: actor.userId, approvedAt: new Date() })
      .where(
        and(
          eq(dispositionBatches.id, parsed.data.batchId),
          eq(dispositionBatches.status, 'proposed'),
        ),
      )
      .returning({ id: dispositionBatches.id })
    if (changed.length === 0) return err('not_proposed')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'disposition.approved',
        entityType: 'disposition_batch',
        entityId: parsed.data.batchId,
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function cancelDisposition(
  db: Db,
  actor: Actor,
  input: { batchId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'invalid' | 'not_cancellable'>> {
  signal.throwIfAborted()
  const allowed =
    (await hasCapability(db, actor.userId, 'disposition.approve', signal)) ||
    (await hasCapability(db, actor.userId, 'disposition.propose', signal))
  if (!allowed) return err('forbidden')
  const parsed = BatchSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  return await transactionResult(db, async (tx) => {
    const changed = await tx
      .update(dispositionBatches)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(
        and(
          eq(dispositionBatches.id, parsed.data.batchId),
          eq(dispositionBatches.status, 'proposed'),
        ),
      )
      .returning({ id: dispositionBatches.id })
    if (changed.length === 0) {
      const approved = await tx
        .update(dispositionBatches)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(
          and(
            eq(dispositionBatches.id, parsed.data.batchId),
            eq(dispositionBatches.status, 'approved'),
          ),
        )
        .returning({ id: dispositionBatches.id })
      if (approved.length === 0) return err('not_cancellable')
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'disposition.cancelled',
        entityType: 'disposition_batch',
        entityId: parsed.data.batchId,
      },
      signal,
    )
    return ok(undefined)
  })
}
