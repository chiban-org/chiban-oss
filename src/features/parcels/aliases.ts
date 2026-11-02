import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { parcelAliases, parcelIdFormats } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import type { AliasSource } from '@/features/parcels/aliasTypes'
import { checkIdFormat, normalizeId } from '@/features/parcels/idFormats'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface AddAliasInput {
  parcelId: string
  format: string
  value: string
  source: AliasSource
}

export type AddAliasError = 'alias_taken' | 'unknown_format' | 'id_format_mismatch'

export type AuditWho = Actor | { kind: 'user'; userId: string } | { kind: 'system'; job: string }

export function auditActor(who: AuditWho) {
  if ('job' in who) return { kind: 'system', job: who.job } as const
  return { kind: 'user', userId: who.userId } as const
}

export async function addAlias(
  tx: Tx,
  input: AddAliasInput,
  who: AuditWho,
  signal: AbortSignal,
): Promise<Result<void, AddAliasError>> {
  signal.throwIfAborted()
  const [format] = await tx
    .select()
    .from(parcelIdFormats)
    .where(eq(parcelIdFormats.key, input.format))
  if (format === undefined) return err('unknown_format')
  const checked = checkIdFormat(
    { key: format.key, kind: format.kind, width: format.width },
    input.value,
  )
  if (!checked.ok) return err('id_format_mismatch')
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

export async function retireAlias(
  tx: Tx,
  key: { format: string; value: string; parcelId?: string; source?: AliasSource },
  reason: 'lineage' | 'overridden' | 'expired' | 'manual',
  retiredOn: CivilDate,
  who: AuditWho,
  signal: AbortSignal,
): Promise<string | null> {
  signal.throwIfAborted()
  const conditions = [
    eq(parcelAliases.format, key.format),
    eq(parcelAliases.value, key.value),
    eq(parcelAliases.status, 'active'),
  ]
  if (key.parcelId !== undefined) conditions.push(eq(parcelAliases.parcelId, key.parcelId))
  if (key.source !== undefined) conditions.push(eq(parcelAliases.source, key.source))
  const [retired] = await tx
    .update(parcelAliases)
    .set({ status: 'retired', retiredOn, retiredReason: reason })
    .where(and(...conditions))
    .returning({ parcelId: parcelAliases.parcelId })
  if (retired === undefined) return null
  await writeAudit(
    tx,
    {
      actor: auditActor(who),
      action: 'parcel.alias.retire',
      entityType: 'parcel',
      entityId: retired.parcelId,
      before: { format: key.format, value: key.value },
      after: { reason, retiredOn },
    },
    signal,
  )
  return retired.parcelId
}
