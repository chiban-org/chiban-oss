import { and, eq, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { documents, enforcementCases, parcels } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { linkRecordToParcel } from '@/features/parcels/recordLinks'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { err, ok, type Result } from '@/types/result'

export type ParcelLookupError = 'parcel_not_found' | 'parcel_ambiguous'

async function byAddress(db: DbOrTx, text: string): Promise<string[]> {
  const rows = await db
    .select({ id: parcels.id })
    .from(parcels)
    .where(
      and(
        eq(parcels.status, 'active'),
        sql`lower(trim(${parcels.siteAddress})) = lower(trim(${text}))`,
      ),
    )
    .limit(2)
  return rows.map((r) => r.id)
}

export async function findParcel(
  db: DbOrTx,
  reference: string,
  signal: AbortSignal,
): Promise<Result<string, ParcelLookupError>> {
  const text = reference.trim()
  if (text === '') return err('parcel_not_found')
  const resolved = await resolveParcelId(db, { value: text }, signal)
  if (resolved.ok) return ok(resolved.value.parcelId)
  if (resolved.error !== 'not_found') return err('parcel_ambiguous')
  const matches = await byAddress(db, text)
  if (matches.length > 1) return err('parcel_ambiguous')
  const [only] = matches
  return only === undefined ? err('parcel_not_found') : ok(only)
}

export async function parcelForLocation(
  db: DbOrTx,
  locationText: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  const found = await findParcel(db, locationText, signal)
  return found.ok ? found.value : undefined
}

export async function setCaseParcel(
  db: Db,
  actor: Actor,
  input: { caseId: string; parcelRef: string },
  signal: AbortSignal,
): Promise<Result<{ parcelId: string }, 'forbidden' | 'not_found' | ParcelLookupError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'enforcement.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parcel = await findParcel(db, input.parcelRef, signal)
  if (!parcel.ok) return err(parcel.error)
  return await transactionResult(db, async (tx) => {
    const updated = await tx
      .update(enforcementCases)
      .set({ parcelId: parcel.value, updatedAt: new Date() })
      .where(eq(enforcementCases.id, input.caseId))
      .returning({ id: enforcementCases.id })
    if (updated.length === 0) return err('not_found')
    await linkRecordToParcel(
      tx,
      { recordKind: 'enforcement_case', recordId: input.caseId, parcelId: parcel.value },
      signal,
    )
    const caseDocuments = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(eq(documents.recordKind, 'enforcement_case'), eq(documents.recordId, input.caseId)),
      )
    for (const doc of caseDocuments) {
      await linkRecordToParcel(
        tx,
        { recordKind: 'document', recordId: doc.id, parcelId: parcel.value },
        signal,
      )
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.case_parcel',
        entityType: 'enforcement_case',
        entityId: input.caseId,
        after: { parcelId: parcel.value },
      },
      signal,
    )
    return ok({ parcelId: parcel.value })
  })
}
