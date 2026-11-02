import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { restrictionHoldings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters, nonEmpty } from '@/features/rosters/manage'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type RestrictionKind = (typeof restrictionHoldings.$inferInsert)['restrictionKind']
export type RestrictionRow = typeof restrictionHoldings.$inferSelect

export async function addRestriction(
  db: Db,
  actor: Actor,
  input: {
    parcelId: string
    holderName: string
    holderMailingAddress: string
    restrictionKind: RestrictionKind
    recordedReference: string
  },
  signal: AbortSignal,
): Promise<Result<{ holdingId: string }, 'forbidden' | 'address_required' | 'holder_required'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  if (!nonEmpty(input.holderName)) return err('holder_required')
  if (!nonEmpty(input.holderMailingAddress)) return err('address_required')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(restrictionHoldings)
      .values({ ...input, createdBy: actor.userId })
      .returning({ id: restrictionHoldings.id })
    const holdingId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.restriction.add',
        entityType: 'parcel',
        entityId: input.parcelId,
        after: { holdingId, holderName: input.holderName, kind: input.restrictionKind },
      },
      signal,
    )
    return ok({ holdingId })
  })
}

export async function endRestriction(
  db: Db,
  actor: Actor,
  input: { holdingId: string; endedOn: CivilDate },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .update(restrictionHoldings)
      .set({ endedOn: input.endedOn })
      .where(eq(restrictionHoldings.id, input.holdingId))
      .returning({ parcelId: restrictionHoldings.parcelId })
    if (row === undefined) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.restriction.end',
        entityType: 'parcel',
        entityId: row.parcelId,
        after: { holdingId: input.holdingId, endedOn: input.endedOn },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function activeRestrictions(
  db: DbOrTx,
  parcelIds: string[],
  today: CivilDate,
  signal: AbortSignal,
): Promise<RestrictionRow[]> {
  signal.throwIfAborted()
  if (parcelIds.length === 0) return []
  return await db
    .select()
    .from(restrictionHoldings)
    .where(
      and(
        inArray(restrictionHoldings.parcelId, parcelIds),
        or(isNull(restrictionHoldings.endedOn), gt(restrictionHoldings.endedOn, today)),
      ),
    )
}
