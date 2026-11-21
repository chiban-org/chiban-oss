import type { Db } from '@/db/client'
import { sourceWaterDeterminations } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { flagIssuedListStale } from '@/features/abutters/staleList'
import { lockApplication } from '@/features/applications/lockApplication'
import { TERMINAL_STATES } from '@/features/applications/states'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters } from '@/features/rosters/manage'
import { townToday } from '@/features/town/today'
import { err, ok, type Result } from '@/types/result'

export type SourceWaterDetermination = 'within' | 'not_within'

export type SourceWaterError =
  | 'forbidden'
  | 'not_found'
  | 'supplier_required'
  | 'application_closed'

export async function recordSourceWaterDetermination(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    determination: SourceWaterDetermination
    supplierKey: string | null
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, SourceWaterError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const supplierKey = input.determination === 'within' ? (input.supplierKey?.trim() ?? '') : ''
  if (input.determination === 'within' && supplierKey === '') return err('supplier_required')
  return await transactionResult<void, SourceWaterError>(db, async (tx) => {
    const state = await lockApplication(tx, input.applicationId)
    if (state === null) return err('not_found')
    if (TERMINAL_STATES.includes(state)) return err('application_closed')
    const values = {
      applicationId: input.applicationId,
      determination: input.determination,
      supplierKey: supplierKey === '' ? null : supplierKey,
      determinedBy: actor.userId,
      determinedOn: await townToday(tx, now, signal),
    }
    await tx
      .insert(sourceWaterDeterminations)
      .values(values)
      .onConflictDoUpdate({ target: sourceWaterDeterminations.applicationId, set: values })
    await flagIssuedListStale(tx, input.applicationId, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'board.source_water_determination.record',
        entityType: 'application',
        entityId: input.applicationId,
        after: { determination: input.determination, supplierKey: values.supplierKey },
      },
      signal,
    )
    return ok(undefined)
  })
}
