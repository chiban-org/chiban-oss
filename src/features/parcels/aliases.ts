import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { parcelAliases } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import type { AliasSource } from '@/features/parcels/aliasTypes'
import { normalizeId } from '@/features/parcels/idFormats'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface AddAliasInput {
  parcelId: string
  format: string
  value: string
  source: AliasSource
}

export type AuditWho = Actor | { kind: 'system'; job: string }

export function auditActor(who: AuditWho) {
  return 'userId' in who ? ({ kind: 'user', userId: who.userId } as const) : who
}

export async function addAlias(
  tx: Tx,
  input: AddAliasInput,
  who: AuditWho,
  signal: AbortSignal,
): Promise<Result<void, 'alias_taken'>> {
  signal.throwIfAborted()
  const inserted = await tx
    .insert(parcelAliases)
    .values({
      parcelId: input.parcelId,
      format: input.format,
      value: input.value,
      valueNormalized: normalizeId(input.value),
      source: input.source,
    })
    .onConflictDoNothing()
    .returning({ id: parcelAliases.id })
  const row = inserted[0]
  if (row === undefined) return err('alias_taken')
  await writeAudit(
    tx,
    {
      actor: auditActor(who),
      action: 'parcel.alias.add',
      entityType: 'parcel',
      entityId: input.parcelId,
      after: { format: input.format, value: input.value, source: input.source },
    },
    signal,
  )
  return ok(undefined)
}

export async function retireAliases(
  tx: Tx,
  parcelId: string,
  reason: 'lineage' | 'overridden' | 'expired' | 'manual',
  retiredOn: CivilDate,
  who: AuditWho,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted()
  const retired = await tx
    .update(parcelAliases)
    .set({ status: 'retired', retiredOn, retiredReason: reason })
    .where(and(eq(parcelAliases.parcelId, parcelId), eq(parcelAliases.status, 'active')))
    .returning({ format: parcelAliases.format, value: parcelAliases.value })
  if (retired.length > 0) {
    await writeAudit(
      tx,
      {
        actor: auditActor(who),
        action: 'parcel.alias.retire',
        entityType: 'parcel',
        entityId: parcelId,
        before: retired,
        after: { reason, retiredOn },
      },
      signal,
    )
  }
  return retired.length
}
