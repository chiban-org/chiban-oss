import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type AssociationOfficer, associationRosters } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters, nonEmpty, type RosterSaveMode } from '@/features/rosters/manage'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface AssociationInput {
  parcelId: string
  associationName: string
  officers: AssociationOfficer[]
  asOf: CivilDate
}

export type AssociationError =
  | 'forbidden'
  | 'officers_required'
  | 'name_required'
  | 'association_exists'
  | 'not_found'

async function checkedOfficers(
  db: Db,
  actor: Actor,
  input: AssociationInput,
  signal: AbortSignal,
): Promise<Result<AssociationOfficer[], AssociationError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  if (!nonEmpty(input.associationName)) return err('name_required')
  const officers = input.officers.filter((o) => nonEmpty(o.name) && nonEmpty(o.mailingAddress))
  if (officers.length === 0 || officers.length !== input.officers.length) {
    return err('officers_required')
  }
  return ok(officers)
}

function summary(row: { associationName: string; officers: unknown[]; asOf: string }) {
  return { associationName: row.associationName, officers: row.officers.length, asOf: row.asOf }
}

async function saveAssociation(
  db: Db,
  actor: Actor,
  { mode, input }: { mode: RosterSaveMode; input: AssociationInput },
  signal: AbortSignal,
): Promise<Result<void, AssociationError>> {
  const officers = await checkedOfficers(db, actor, input, signal)
  if (!officers.ok) return officers
  const values = {
    parcelId: input.parcelId,
    associationName: input.associationName.trim(),
    officers: officers.value,
    asOf: input.asOf,
    updatedBy: actor.userId,
    updatedAt: new Date(),
  }
  return await transactionResult<void, AssociationError>(db, async (tx) => {
    const [before] = await tx
      .select()
      .from(associationRosters)
      .where(eq(associationRosters.parcelId, input.parcelId))
      .for('update')
    if (mode === 'update' && before === undefined) return err('not_found')
    const insert = tx.insert(associationRosters).values(values)
    const saved =
      mode === 'add'
        ? await insert
            .onConflictDoNothing({ target: associationRosters.parcelId })
            .returning({ parcelId: associationRosters.parcelId })
        : await insert
            .onConflictDoUpdate({ target: associationRosters.parcelId, set: values })
            .returning({ parcelId: associationRosters.parcelId })
    if (saved.length === 0) return err('association_exists')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `roster.association.${mode}`,
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

export async function upsertAssociation(
  db: Db,
  actor: Actor,
  input: AssociationInput,
  signal: AbortSignal,
): Promise<Result<void, AssociationError>> {
  return await saveAssociation(db, actor, { mode: 'upsert', input }, signal)
}

export async function addAssociation(
  db: Db,
  actor: Actor,
  input: AssociationInput,
  signal: AbortSignal,
): Promise<Result<void, AssociationError>> {
  return await saveAssociation(db, actor, { mode: 'add', input }, signal)
}

export async function updateAssociation(
  db: Db,
  actor: Actor,
  input: AssociationInput,
  signal: AbortSignal,
): Promise<Result<void, AssociationError>> {
  return await saveAssociation(db, actor, { mode: 'update', input }, signal)
}
