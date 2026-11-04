import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type ParkTenant, parkRosters } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters, nonEmpty, type RosterSaveMode } from '@/features/rosters/manage'
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

export type ParkError =
  | 'forbidden'
  | 'tenants_required'
  | 'owner_required'
  | 'park_exists'
  | 'not_found'

async function checkedTenants(
  db: Db,
  actor: Actor,
  input: ParkInput,
  signal: AbortSignal,
): Promise<Result<ParkTenant[], ParkError>> {
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
  return ok(tenants)
}

function summary(row: { parkName: string; tenants: unknown[]; asOf: string }) {
  return { parkName: row.parkName, tenants: row.tenants.length, asOf: row.asOf }
}

async function savePark(
  db: Db,
  actor: Actor,
  { mode, input }: { mode: RosterSaveMode; input: ParkInput },
  signal: AbortSignal,
): Promise<Result<void, ParkError>> {
  const tenants = await checkedTenants(db, actor, input, signal)
  if (!tenants.ok) return tenants
  const values = {
    parcelId: input.parcelId,
    parkName: input.parkName.trim(),
    ownerName: input.ownerName.trim(),
    ownerMailingAddress: input.ownerMailingAddress.trim(),
    tenants: tenants.value,
    asOf: input.asOf,
    updatedBy: actor.userId,
    updatedAt: new Date(),
  }
  return await transactionResult<void, ParkError>(db, async (tx) => {
    const [before] = await tx
      .select()
      .from(parkRosters)
      .where(eq(parkRosters.parcelId, input.parcelId))
      .for('update')
    if (mode === 'update' && before === undefined) return err('not_found')
    const insert = tx.insert(parkRosters).values(values)
    const saved =
      mode === 'add'
        ? await insert
            .onConflictDoNothing({ target: parkRosters.parcelId })
            .returning({ parcelId: parkRosters.parcelId })
        : await insert
            .onConflictDoUpdate({ target: parkRosters.parcelId, set: values })
            .returning({ parcelId: parkRosters.parcelId })
    if (saved.length === 0) return err('park_exists')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `roster.park.${mode}`,
        entityType: 'parcel',
        entityId: input.parcelId,
        before: before === undefined ? null : summary(before),
        after: summary(values),
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function upsertPark(
  db: Db,
  actor: Actor,
  input: ParkInput,
  signal: AbortSignal,
): Promise<Result<void, ParkError>> {
  return await savePark(db, actor, { mode: 'upsert', input }, signal)
}

export async function addPark(
  db: Db,
  actor: Actor,
  input: ParkInput,
  signal: AbortSignal,
): Promise<Result<void, ParkError>> {
  return await savePark(db, actor, { mode: 'add', input }, signal)
}

export async function updatePark(
  db: Db,
  actor: Actor,
  input: ParkInput,
  signal: AbortSignal,
): Promise<Result<void, ParkError>> {
  return await savePark(db, actor, { mode: 'update', input }, signal)
}
