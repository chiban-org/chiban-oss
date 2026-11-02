import type { Db } from '@/db/client'
import { type ParkTenant, parkRosters } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters, nonEmpty } from '@/features/rosters/manage'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface ParkInput {
  parcelId: string
  parkName: string
  ownerName: string
  ownerMailingAddress: string
  tenants: ParkTenant[]
  asOf: CivilDate
}

export async function upsertPark(
  db: Db,
  actor: Actor,
  input: ParkInput,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'tenants_required' | 'owner_required'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  if (!nonEmpty(input.ownerName) || !nonEmpty(input.ownerMailingAddress)) {
    return err('owner_required')
  }
  const tenants = input.tenants.filter(
    (t) => nonEmpty(t.tenantId) && nonEmpty(t.name) && nonEmpty(t.mailingAddress),
  )
  if (tenants.length === 0 || tenants.length !== input.tenants.length) {
    return err('tenants_required')
  }
  return await transactionResult(db, async (tx) => {
    const values = {
      parcelId: input.parcelId,
      parkName: input.parkName.trim(),
      ownerName: input.ownerName.trim(),
      ownerMailingAddress: input.ownerMailingAddress.trim(),
      tenants,
      asOf: input.asOf,
      updatedBy: actor.userId,
      updatedAt: new Date(),
    }
    await tx
      .insert(parkRosters)
      .values(values)
      .onConflictDoUpdate({ target: parkRosters.parcelId, set: values })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.park.upsert',
        entityType: 'parcel',
        entityId: input.parcelId,
        after: { parkName: values.parkName, tenants: tenants.length, asOf: input.asOf },
      },
      signal,
    )
    return ok(undefined)
  })
}
