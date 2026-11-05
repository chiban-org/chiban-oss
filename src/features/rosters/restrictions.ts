import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { restrictionHoldings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { canonicalJson } from '@/features/export/canonical'
import { mayManageAbutters, nonEmpty } from '@/features/rosters/manage'
import { flagListsUsing } from '@/features/rosters/usedBy'
import { townToday } from '@/features/town/today'
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
    now?: Date
  },
  signal: AbortSignal,
): Promise<Result<{ holdingId: string }, 'forbidden' | 'address_required' | 'holder_required'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  if (!nonEmpty(input.holderName)) return err('holder_required')
  if (!nonEmpty(input.holderMailingAddress)) return err('address_required')
  const { now, ...holding } = input
  const checkedOn = await townToday(db, now ?? new Date(), signal)
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(restrictionHoldings)
      .values({ ...holding, checkedOn, createdBy: actor.userId })
      .returning({ id: restrictionHoldings.id })
    const holdingId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.restriction.add',
        entityType: 'parcel',
        entityId: input.parcelId,
        after: { holdingId, ...holdingSummary(holding) },
      },
      signal,
    )
    return ok({ holdingId })
  })
}

export interface RestrictionChange {
  holdingId: string
  holderName: string
  holderMailingAddress: string
  restrictionKind: RestrictionKind
  recordedReference: string
  now?: Date
}

function holdingSummary(row: Omit<RestrictionChange, 'holdingId' | 'now'>) {
  return {
    holderName: row.holderName,
    holderMailingAddress: row.holderMailingAddress,
    kind: row.restrictionKind,
    recordedReference: row.recordedReference,
  }
}

export async function updateRestriction(
  db: Db,
  actor: Actor,
  input: RestrictionChange,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found' | 'address_required' | 'holder_required'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  if (!nonEmpty(input.holderName)) return err('holder_required')
  if (!nonEmpty(input.holderMailingAddress)) return err('address_required')
  const { holdingId, now, ...change } = input
  const today = await townToday(db, now ?? new Date(), signal)
  const values = {
    ...change,
    holderName: change.holderName.trim(),
    holderMailingAddress: change.holderMailingAddress.trim(),
    recordedReference: change.recordedReference.trim(),
  }
  return await transactionResult(db, async (tx) => {
    const [before] = await tx
      .select()
      .from(restrictionHoldings)
      .where(eq(restrictionHoldings.id, holdingId))
      .for('update')
    if (before === undefined) return err('not_found')
    await tx
      .update(restrictionHoldings)
      .set({ ...values, checkedOn: today })
      .where(eq(restrictionHoldings.id, holdingId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.restriction.update',
        entityType: 'parcel',
        entityId: before.parcelId,
        before: { holdingId, ...holdingSummary(before) },
        after: { holdingId, ...holdingSummary(values) },
      },
      signal,
    )
    if (canonicalJson(holdingSummary(before)) !== canonicalJson(holdingSummary(values))) {
      await flagListsUsing(tx, holdingId, today, signal)
    }
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
