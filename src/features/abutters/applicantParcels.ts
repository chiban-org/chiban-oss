import { and, asc, eq } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { abutterLists, applicationParcels } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { flagIssuedListStale } from '@/features/abutters/staleList'
import { lockApplication } from '@/features/applications/lockApplication'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters } from '@/features/rosters/manage'
import { err, ok, type Result } from '@/types/result'

export type ApplicantParcelError = 'forbidden' | 'parcel_required'

const PARCELS_CHANGED = 'the applicant parcels changed'

export async function applicantParcelIds(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({ parcelId: applicationParcels.parcelId })
    .from(applicationParcels)
    .where(eq(applicationParcels.applicationId, applicationId))
    .orderBy(asc(applicationParcels.addedAt), asc(applicationParcels.parcelId))
  return rows.map((r) => r.parcelId)
}

export function sameParcels(first: readonly string[], second: readonly string[]): boolean {
  const held = new Set(first)
  return held.size === new Set(second).size && second.every((id) => held.has(id))
}

async function replaceParcels(
  tx: Tx,
  actor: Actor,
  applicationId: string,
  parcelIds: string[],
  signal: AbortSignal,
): Promise<void> {
  const before = await applicantParcelIds(tx, applicationId, signal)
  if (sameParcels(before, parcelIds)) return
  await tx.delete(applicationParcels).where(eq(applicationParcels.applicationId, applicationId))
  await tx
    .insert(applicationParcels)
    .values(parcelIds.map((parcelId) => ({ applicationId, parcelId, addedBy: actor.userId })))
  await tx
    .update(abutterLists)
    .set({ status: 'discarded' })
    .where(and(eq(abutterLists.applicationId, applicationId), eq(abutterLists.status, 'draft')))
  await flagIssuedListStale(tx, applicationId, signal, PARCELS_CHANGED)
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'abutters.applicant_parcels.set',
      entityType: 'application',
      entityId: applicationId,
      before: { parcelIds: before },
      after: { parcelIds },
    },
    signal,
  )
}

export async function setApplicantParcels(
  db: Db,
  actor: Actor,
  input: { applicationId: string; parcelIds: string[] },
  signal: AbortSignal,
): Promise<Result<void, ApplicantParcelError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const parcelIds = [...new Set(input.parcelIds)]
  if (parcelIds.length === 0) return err('parcel_required')
  return await transactionResult<void, ApplicantParcelError>(db, async (tx) => {
    await lockApplication(tx, input.applicationId)
    await replaceParcels(tx, actor, input.applicationId, parcelIds, signal)
    return ok(undefined)
  })
}

export async function addApplicantParcel(
  db: Db,
  actor: Actor,
  input: { applicationId: string; parcelId: string },
  signal: AbortSignal,
): Promise<Result<void, ApplicantParcelError>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  return await transactionResult<void, ApplicantParcelError>(db, async (tx) => {
    await lockApplication(tx, input.applicationId)
    const existing = await applicantParcelIds(tx, input.applicationId, signal)
    const parcelIds = [...new Set([...existing, input.parcelId])]
    await replaceParcels(tx, actor, input.applicationId, parcelIds, signal)
    return ok(undefined)
  })
}
