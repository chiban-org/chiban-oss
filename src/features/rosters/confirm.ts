import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { associationRosters, parkRosters, restrictionHoldings } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters } from '@/features/rosters/manage'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export const ENTRY_KINDS = ['association', 'park', 'restriction'] as const
export type EntryKind = (typeof ENTRY_KINDS)[number]

const TABLES = {
  association: associationRosters,
  park: parkRosters,
  restriction: restrictionHoldings,
} as const

export async function confirmEntry(
  db: Db,
  actor: Actor,
  input: { kind: EntryKind; entryId: string; now?: Date },
  signal: AbortSignal,
): Promise<Result<{ checkedOn: string }, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const today = await townToday(db, input.now ?? new Date(), signal)
  const table = TABLES[input.kind]
  return await transactionResult<{ checkedOn: string }, 'forbidden' | 'not_found'>(
    db,
    async (tx) => {
      const [row] = await tx
        .update(table)
        .set({ checkedOn: today })
        .where(eq(table.id, input.entryId))
        .returning({ parcelId: table.parcelId })
      if (row === undefined) return err('not_found')
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: `roster.${input.kind}.confirm`,
          entityType: 'parcel',
          entityId: row.parcelId,
          after: { entryId: input.entryId, checkedOn: today },
        },
        signal,
      )
      return ok({ checkedOn: today })
    },
  )
}
