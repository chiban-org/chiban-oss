import { asc, eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { applicationParcels } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters } from '@/features/rosters/manage'
import { err, ok, type Result } from '@/types/result'

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

export async function setApplicantParcels(
  db: Db,
  actor: Actor,
  input: { applicationId: string; parcelIds: string[] },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'parcel_required'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  const parcelIds = [...new Set(input.parcelIds)]
  if (parcelIds.length === 0) return err('parcel_required')
  return await transactionResult(db, async (tx) => {
    const before = await applicantParcelIds(tx, input.applicationId, signal)
    await tx
      .delete(applicationParcels)
      .where(eq(applicationParcels.applicationId, input.applicationId))
    await tx.insert(applicationParcels).values(
      parcelIds.map((parcelId) => ({
        applicationId: input.applicationId,
        parcelId,
        addedBy: actor.userId,
      })),
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'abutters.applicant_parcels.set',
        entityType: 'application',
        entityId: input.applicationId,
        before: { parcelIds: before },
        after: { parcelIds },
      },
      signal,
    )
    return ok(undefined)
  })
}
