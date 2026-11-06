import { and, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { abutterLists, associationRosters, parkRosters } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters } from '@/features/rosters/manage'
import { flagListsUsing } from '@/features/rosters/usedBy'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const ENDABLE_KINDS = ['association', 'park'] as const
export type EndableKind = (typeof ENDABLE_KINDS)[number]

export type UndoRosterEndError =
  | 'forbidden'
  | 'not_found'
  | 'not_ended'
  | 'ending_used'
  | 'replaced'

export type EndRosterError = 'forbidden' | 'not_found' | 'already_ended'

const TABLES = { association: associationRosters, park: parkRosters } as const

export async function rosterEndingUsed(
  db: DbOrTx,
  entry: { id: string; parcelId: string; endedAt: Date | null },
): Promise<boolean> {
  if (entry.endedAt === null) return false
  const [used] = await db
    .select({ id: abutterLists.id })
    .from(abutterLists)
    .where(
      and(
        inArray(abutterLists.status, ['issued', 'superseded']),
        gt(abutterLists.issuedAt, entry.endedAt),
        sql`jsonb_path_exists(${abutterLists.snapshot}, '$.candidates[*] ? (@.parcelId == $parcel)', jsonb_build_object('parcel', ${entry.parcelId}::text))`,
        sql`not jsonb_path_exists(${abutterLists.snapshot}, '$.recipients[*].provenance[*] ? (@.ref == $ref)', jsonb_build_object('ref', ${entry.id}::text))`,
      ),
    )
    .limit(1)
  return used !== undefined
}

export async function endRosterEntry(
  db: Db,
  actor: Actor,
  input: { kind: EndableKind; entryId: string; endedOn: CivilDate; now?: Date },
  signal: AbortSignal,
): Promise<Result<void, EndRosterError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const now = input.now ?? new Date()
  const today = await townToday(db, now, signal)
  const table = TABLES[input.kind]
  return await transactionResult<void, EndRosterError>(db, async (tx) => {
    const [before] = await tx
      .select({ parcelId: table.parcelId, endedOn: table.endedOn })
      .from(table)
      .where(eq(table.id, input.entryId))
      .for('update')
    if (before === undefined) return err('not_found')
    if (before.endedOn !== null) return err('already_ended')
    await tx
      .update(table)
      .set({ endedOn: input.endedOn, endedAt: now })
      .where(eq(table.id, input.entryId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `roster.${input.kind}.end`,
        entityType: 'parcel',
        entityId: before.parcelId,
        before: { entryId: input.entryId, endedOn: before.endedOn },
        after: { entryId: input.entryId, endedOn: input.endedOn },
      },
      signal,
    )
    await flagListsUsing(tx, input.entryId, today, signal)
    return ok(undefined)
  })
}

export async function undoRosterEnd(
  db: Db,
  actor: Actor,
  input: { kind: EndableKind; entryId: string },
  signal: AbortSignal,
): Promise<Result<void, UndoRosterEndError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const table = TABLES[input.kind]
  return await transactionResult<void, UndoRosterEndError>(db, async (tx) => {
    const [entry] = await tx
      .select({
        id: table.id,
        parcelId: table.parcelId,
        endedOn: table.endedOn,
        endedAt: table.endedAt,
      })
      .from(table)
      .where(eq(table.id, input.entryId))
      .for('update')
    if (entry === undefined) return err('not_found')
    if (entry.endedOn === null) return err('not_ended')
    const [replacement] = await tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.parcelId, entry.parcelId), isNull(table.endedOn), ne(table.id, entry.id)))
      .limit(1)
    if (replacement !== undefined) return err('replaced')
    if (await rosterEndingUsed(tx, entry)) return err('ending_used')
    await tx.update(table).set({ endedOn: null, endedAt: null }).where(eq(table.id, input.entryId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `roster.${input.kind}.undo_end`,
        entityType: 'parcel',
        entityId: entry.parcelId,
        before: { entryId: input.entryId, endedOn: entry.endedOn },
        after: { entryId: input.entryId, endedOn: null },
      },
      signal,
    )
    return ok(undefined)
  })
}
