import { and, eq, gt, inArray, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { abutterLists, restrictionHoldings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters } from '@/features/rosters/manage'
import { flagListsUsing } from '@/features/rosters/usedBy'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type UndoEndError = 'forbidden' | 'not_found' | 'not_ended' | 'ending_used'

export async function endingUsed(
  db: DbOrTx,
  holding: { id: string; parcelId: string; endedAt: Date | null },
): Promise<boolean> {
  if (holding.endedAt === null) return false
  const [used] = await db
    .select({ id: abutterLists.id })
    .from(abutterLists)
    .where(
      and(
        inArray(abutterLists.status, ['issued', 'superseded']),
        gt(abutterLists.issuedAt, holding.endedAt),
        sql`${abutterLists.snapshot}->'applicantParcelIds' @> ${JSON.stringify([holding.parcelId])}::jsonb`,
        sql`not jsonb_path_exists(${abutterLists.snapshot}, '$.recipients[*].provenance[*] ? (@.ref == $ref)', jsonb_build_object('ref', ${holding.id}::text))`,
      ),
    )
    .limit(1)
  return used !== undefined
}

export async function endRestriction(
  db: Db,
  actor: Actor,
  input: { holdingId: string; endedOn: CivilDate; now?: Date },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const now = input.now ?? new Date()
  const today = await townToday(db, now, signal)
  return await transactionResult(db, async (tx) => {
    const [before] = await tx
      .select({ endedOn: restrictionHoldings.endedOn })
      .from(restrictionHoldings)
      .where(eq(restrictionHoldings.id, input.holdingId))
      .for('update')
    const [row] = await tx
      .update(restrictionHoldings)
      .set({ endedOn: input.endedOn, endedAt: now })
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
        before: { holdingId: input.holdingId, endedOn: before?.endedOn ?? null },
        after: { holdingId: input.holdingId, endedOn: input.endedOn },
      },
      signal,
    )
    await flagListsUsing(tx, input.holdingId, today, signal)
    return ok(undefined)
  })
}

export async function undoRestrictionEnd(
  db: Db,
  actor: Actor,
  input: { holdingId: string },
  signal: AbortSignal,
): Promise<Result<void, UndoEndError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  return await transactionResult<void, UndoEndError>(db, async (tx) => {
    const [holding] = await tx
      .select()
      .from(restrictionHoldings)
      .where(eq(restrictionHoldings.id, input.holdingId))
      .for('update')
    if (holding === undefined) return err('not_found')
    if (holding.endedOn === null) return err('not_ended')
    if (await endingUsed(tx, holding)) return err('ending_used')
    await tx
      .update(restrictionHoldings)
      .set({ endedOn: null, endedAt: null })
      .where(eq(restrictionHoldings.id, input.holdingId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.restriction.undo_end',
        entityType: 'parcel',
        entityId: holding.parcelId,
        before: { holdingId: input.holdingId, endedOn: holding.endedOn },
        after: { holdingId: input.holdingId, endedOn: null },
      },
      signal,
    )
    return ok(undefined)
  })
}
