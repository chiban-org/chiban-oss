import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import {
  ENFORCEMENT_APPEAL_OUTCOMES,
  enforcementAppeals,
  enforcementOrders,
  restrainingOrders,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { targetIssuer } from '@/features/enforcement/appealStayChecks'
import { lockCase } from '@/features/enforcement/cases'
import { civilDateSchema } from '@/features/packs/schema'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export {
  certifyImminentPeril,
  recordRestrainingOrder,
} from '@/features/enforcement/appealStayChecks'

const AppealSchema = z.object({
  caseId: z.string().uuid(),
  targetKind: z.enum(['order', 'notice']),
  targetId: z.string().uuid(),
  filedOn: civilDateSchema,
  appellantName: z.string().trim().min(1).max(200),
})

export async function recordEnforcementAppeal(
  db: Db,
  actor: Actor,
  input: z.input<typeof AppealSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<{ appealId: string }, 'forbidden' | 'invalid' | 'target_not_found' | 'date_in_future'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = AppealSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    if (value.filedOn > (await townToday(tx, now, signal))) return err('date_in_future')
    const issuer = await targetIssuer(tx, value.caseId, value.targetKind, value.targetId)
    if (issuer === undefined) return err('target_not_found')
    const [row] = await tx
      .insert(enforcementAppeals)
      .values({
        caseId: value.caseId,
        targetKind: value.targetKind,
        targetId: value.targetId,
        filedOn: value.filedOn,
        appellantName: value.appellantName,
        recordedBy: actor.userId,
      })
      .returning({ id: enforcementAppeals.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.appeal_filed',
        entityType: 'enforcement_case',
        entityId: value.caseId,
        after: { appealId: row?.id, targetKind: value.targetKind, filedOn: value.filedOn },
      },
      signal,
    )
    return ok({ appealId: row?.id ?? '' })
  })
}

const ResolveSchema = z.object({
  appealId: z.string().uuid(),
  resolvedOn: civilDateSchema,
  outcome: z.enum(ENFORCEMENT_APPEAL_OUTCOMES),
})

export async function resolveEnforcementAppeal(
  db: Db,
  actor: Actor,
  input: z.input<typeof ResolveSchema>,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<void, 'forbidden' | 'invalid' | 'not_found' | 'already_resolved' | 'date_in_future'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = ResolveSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  return await transactionResult(db, async (tx) => {
    if (value.resolvedOn > (await townToday(tx, now, signal))) return err('date_in_future')
    const [target] = await tx
      .select({ caseId: enforcementAppeals.caseId })
      .from(enforcementAppeals)
      .where(eq(enforcementAppeals.id, value.appealId))
    if (target === undefined) return err('not_found')
    await lockCase(tx, target.caseId)
    const [appeal] = await tx
      .select()
      .from(enforcementAppeals)
      .where(eq(enforcementAppeals.id, value.appealId))
      .for('update')
    if (appeal === undefined) return err('not_found')
    if (appeal.resolvedOn !== null) return err('already_resolved')
    if (value.resolvedOn < appeal.filedOn) return err('invalid')
    await tx
      .update(enforcementAppeals)
      .set({ resolvedOn: value.resolvedOn, outcome: value.outcome })
      .where(eq(enforcementAppeals.id, value.appealId))
    if (value.outcome === 'annulled' && appeal.targetKind === 'order') {
      await tx
        .update(enforcementOrders)
        .set({ status: 'annulled', rowVersion: sql`${enforcementOrders.rowVersion} + 1` })
        .where(eq(enforcementOrders.id, appeal.targetId))
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.appeal_resolved',
        entityType: 'enforcement_case',
        entityId: appeal.caseId,
        after: { appealId: value.appealId, outcome: value.outcome, resolvedOn: value.resolvedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function dissolveRestrainingOrder(
  db: Db,
  actor: Actor,
  input: { restrainingOrderId: string; dissolvedOn: z.input<typeof civilDateSchema> },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'invalid' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.record_service', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = civilDateSchema.safeParse(input.dissolvedOn)
  if (!parsed.success) return err('invalid')
  return await transactionResult(db, async (tx) => {
    const updated = await tx
      .update(restrainingOrders)
      .set({ dissolvedOn: parsed.data })
      .where(eq(restrainingOrders.id, input.restrainingOrderId))
      .returning({ id: restrainingOrders.id, appealId: restrainingOrders.appealId })
    const row = updated[0]
    if (row === undefined) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.restraining_order_dissolved',
        entityType: 'restraining_order',
        entityId: row.id,
        after: { dissolvedOn: parsed.data },
      },
      signal,
    )
    return ok(undefined)
  })
}
