import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type ParkTenant, parkRosters } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { canonicalJson } from '@/features/export/canonical'
import { mayManageAbutters, nonEmpty, type RosterSaveMode } from '@/features/rosters/manage'
import { flagListsUsing } from '@/features/rosters/usedBy'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface ParkInput {
  parcelId: string
  parkName: string
  ownerName: string
  ownerMailingAddress: string
  tenants: ParkTenant[]
  asOf: CivilDate
  now?: Date
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

type ParkContent = Pick<ParkInput, 'parkName' | 'ownerName' | 'ownerMailingAddress' | 'tenants'>

function summary(row: ParkContent & { asOf: string }) {
  return {
    parkName: row.parkName,
    ownerName: row.ownerName,
    ownerMailingAddress: row.ownerMailingAddress,
    tenants: row.tenants,
    asOf: row.asOf,
  }
}

function contentChanged(before: ParkContent, after: ParkContent): boolean {
  const content = (p: ParkContent) =>
    canonicalJson([p.parkName, p.ownerName, p.ownerMailingAddress, p.tenants])
  return content(before) !== content(after)
}

async function savePark(
  db: Db,
  actor: Actor,
  { mode, input }: { mode: RosterSaveMode; input: ParkInput },
  signal: AbortSignal,
): Promise<Result<void, ParkError>> {
  const tenants = await checkedTenants(db, actor, input, signal)
  if (!tenants.ok) return tenants
  const today = await townToday(db, input.now ?? new Date(), signal)
  const values = {
    parcelId: input.parcelId,
    parkName: input.parkName.trim(),
    ownerName: input.ownerName.trim(),
    ownerMailingAddress: input.ownerMailingAddress.trim(),
    tenants: tenants.value,
    asOf: input.asOf,
    checkedOn: today,
    updatedBy: actor.userId,
    updatedAt: new Date(),
  }
  return await transactionResult<void, ParkError>(db, async (tx) => {
    const [before] = await tx
      .select()
      .from(parkRosters)
      .where(and(eq(parkRosters.parcelId, input.parcelId), isNull(parkRosters.endedOn)))
      .for('update')
    if (mode === 'update' && before === undefined) return err('not_found')
    const insert = tx.insert(parkRosters).values(values)
    const saved =
      mode === 'add'
        ? await insert
            .onConflictDoNothing({
              target: parkRosters.parcelId,
              where: isNull(parkRosters.endedOn),
            })
            .returning({ id: parkRosters.id })
        : await insert
            .onConflictDoUpdate({
              target: parkRosters.parcelId,
              targetWhere: isNull(parkRosters.endedOn),
              set: values,
            })
            .returning({ id: parkRosters.id })
    if (saved.length === 0) return err('park_exists')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `roster.park.${mode}`,
        entityType: 'parcel',
        entityId: input.parcelId,
        before: before === undefined ? null : { entryId: before.id, ...summary(before) },
        after: { entryId: saved[0]?.id ?? null, ...summary(values) },
      },
      signal,
    )
    if (before !== undefined && contentChanged(before, values)) {
      await flagListsUsing(tx, before.id, today, signal)
    }
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
