import { and, desc, eq, isNull, lt, ne } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { aliasOverrides, parcelIdFormats, parcels } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { addAlias, retireAlias } from '@/features/parcels/aliases'
import { displayIdsFor } from '@/features/parcels/displayId'
import { checkIdFormat } from '@/features/parcels/idFormats'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, parseCivilDate, todayInTimeZone } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const FALLBACK_TIME_ZONE = 'UTC'

const inputSchema = z.object({
  format: z.string().min(1),
  value: z.string().min(1),
  parcelId: z.uuid(),
  reason: z.string(),
  expiresOn: z.string().optional(),
})

export type OverrideInput = {
  format: string
  value: string
  parcelId: string
  reason: string
  expiresOn?: string
}

export type OverrideStatus = 'applied' | 'no_match' | 'superseded' | 'expired'

export interface AliasOverrideRow {
  id: string
  format: string
  value: string
  parcelId: string
  parcelDisplayId: string | null
  reason: string
  createdBy: string
  createdAt: Date
  expiresOn: CivilDate | null
  status: OverrideStatus
  replaced: { parcelId: string; displayId: string } | null
}

export type OverrideError =
  | 'forbidden'
  | 'reason_required'
  | 'id_format_mismatch'
  | 'invalid_parcel_id'
  | 'invalid_date'
  | 'unknown_parcel'
  | 'unknown_format'

async function townToday(db: Db, now: Date, signal: AbortSignal): Promise<CivilDate> {
  const town = await getTownSettings(db, signal)
  return todayInTimeZone(town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE, now)
}

export async function createAliasOverride(
  db: Db,
  actor: Actor,
  input: OverrideInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ overrideId: string }, OverrideError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return err('invalid_parcel_id')
  const { format, value, parcelId, expiresOn } = parsed.data
  const reason = parsed.data.reason.trim()
  if (reason === '') return err('reason_required')
  if (expiresOn !== undefined && !parseCivilDate(expiresOn).ok) return err('invalid_date')
  const [fmt] = await db.select().from(parcelIdFormats).where(eq(parcelIdFormats.key, format))
  if (fmt === undefined) return err('unknown_format')
  if (!checkIdFormat({ key: fmt.key, kind: fmt.kind, width: fmt.width }, value).ok) {
    return err('id_format_mismatch')
  }
  const today = await townToday(db, now, signal)
  return await transactionResult(db, async (tx) => {
    const [target] = await tx
      .select({ id: parcels.id })
      .from(parcels)
      .where(eq(parcels.id, parcelId))
      .for('update')
    if (target === undefined) return err('unknown_parcel')
    const replacedParcelId = await retireAlias(
      tx,
      { format, value },
      'overridden',
      today,
      actor,
      signal,
    )
    const [created] = await tx
      .insert(aliasOverrides)
      .values({
        format,
        value,
        parcelId,
        replacedParcelId,
        reason,
        expiresOn: expiresOn ?? null,
        createdBy: actor.userId,
      })
      .returning({ id: aliasOverrides.id })
    const overrideId = created?.id ?? ''
    await tx
      .update(aliasOverrides)
      .set({ supersededBy: overrideId })
      .where(
        and(
          eq(aliasOverrides.format, format),
          eq(aliasOverrides.value, value),
          ne(aliasOverrides.id, overrideId),
          isNull(aliasOverrides.supersededBy),
        ),
      )
    await addAlias(tx, { parcelId, format, value, source: 'override' }, actor, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'alias_override.create',
        entityType: 'alias_override',
        entityId: overrideId,
        after: { format, value, parcelId, replacedParcelId, reason, expiresOn: expiresOn ?? null },
      },
      signal,
    )
    return ok({ overrideId })
  })
}

function statusOf(
  row: { supersededBy: string | null; expiresOn: string | null },
  parcelStatus: string,
  today: CivilDate,
): OverrideStatus {
  if (row.supersededBy !== null) return 'superseded'
  if (row.expiresOn !== null && row.expiresOn < today) return 'expired'
  if (parcelStatus === 'retired') return 'no_match'
  return 'applied'
}

export async function listAliasOverrides(
  db: Db,
  now: Date,
  signal: AbortSignal,
): Promise<AliasOverrideRow[]> {
  signal.throwIfAborted()
  const today = await townToday(db, now, signal)
  const rows = await db
    .select({ o: aliasOverrides, parcelStatus: parcels.status })
    .from(aliasOverrides)
    .innerJoin(parcels, eq(parcels.id, aliasOverrides.parcelId))
    .orderBy(desc(aliasOverrides.createdAt))
  const ids = rows.flatMap(({ o }) =>
    o.replacedParcelId === null ? [o.parcelId] : [o.parcelId, o.replacedParcelId],
  )
  const display = await displayIdsFor(db, ids)
  return rows.map(({ o, parcelStatus }) => ({
    id: o.id,
    format: o.format,
    value: o.value,
    parcelId: o.parcelId,
    parcelDisplayId: display.get(o.parcelId) ?? null,
    reason: o.reason,
    createdBy: o.createdBy,
    createdAt: o.createdAt,
    expiresOn: o.expiresOn as CivilDate | null,
    status: statusOf(o, parcelStatus, today),
    replaced:
      o.replacedParcelId === null
        ? null
        : { parcelId: o.replacedParcelId, displayId: display.get(o.replacedParcelId) ?? '' },
  }))
}

export async function expireAliasOverrides(
  db: Db,
  now: Date,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted()
  const today = await townToday(db, now, signal)
  const due = await db
    .select()
    .from(aliasOverrides)
    .where(and(lt(aliasOverrides.expiresOn, today), isNull(aliasOverrides.supersededBy)))
  let retired = 0
  for (const o of due) {
    const done = await db.transaction(
      async (tx) =>
        await retireAlias(
          tx,
          { format: o.format, value: o.value, parcelId: o.parcelId, source: 'override' },
          'expired',
          today,
          { kind: 'system', job: 'parcels.expireAliasOverrides' },
          signal,
        ),
    )
    if (done !== null) retired += 1
  }
  return retired
}
