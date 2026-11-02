import type { Db } from '@/db/client'
import { type AssociationOfficer, associationRosters } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters, nonEmpty } from '@/features/rosters/manage'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface AssociationInput {
  parcelId: string
  associationName: string
  officers: AssociationOfficer[]
  asOf: CivilDate
}

export async function upsertAssociation(
  db: Db,
  actor: Actor,
  input: AssociationInput,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'officers_required' | 'name_required'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  if (!nonEmpty(input.associationName)) return err('name_required')
  const officers = input.officers.filter((o) => nonEmpty(o.name) && nonEmpty(o.mailingAddress))
  if (officers.length === 0 || officers.length !== input.officers.length) {
    return err('officers_required')
  }
  return await transactionResult(db, async (tx) => {
    const values = {
      parcelId: input.parcelId,
      associationName: input.associationName.trim(),
      officers,
      asOf: input.asOf,
      updatedBy: actor.userId,
      updatedAt: new Date(),
    }
    await tx
      .insert(associationRosters)
      .values(values)
      .onConflictDoUpdate({ target: associationRosters.parcelId, set: values })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.association.upsert',
        entityType: 'parcel',
        entityId: input.parcelId,
        after: {
          associationName: values.associationName,
          officers: officers.length,
          asOf: input.asOf,
        },
      },
      signal,
    )
    return ok(undefined)
  })
}
