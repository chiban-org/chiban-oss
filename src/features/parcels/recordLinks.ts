import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { parcelRecordCarryForwards, parcelRecordLinks } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { listAncestors } from '@/features/parcels/ancestors'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { err, ok, type Result } from '@/types/result'

export async function linkRecordToParcel(
  tx: Tx,
  input: { recordKind: string; recordId: string; parcelId: string },
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted()
  await tx
    .insert(parcelRecordLinks)
    .values({ ...input, status: 'linked', linkedVia: 'direct' })
    .onConflictDoNothing()
  const [row] = await tx
    .select({ id: parcelRecordLinks.id })
    .from(parcelRecordLinks)
    .where(
      and(
        eq(parcelRecordLinks.recordKind, input.recordKind),
        eq(parcelRecordLinks.recordId, input.recordId),
        eq(parcelRecordLinks.parcelId, input.parcelId),
      ),
    )
  return row?.id ?? ''
}

export async function linkRecordByRawRef(
  tx: Tx,
  input: { recordKind: string; recordId: string; format?: string; value: string },
  signal: AbortSignal,
): Promise<{ status: 'linked' | 'unresolved'; linkId: string }> {
  signal.throwIfAborted()
  const ref =
    input.format === undefined
      ? { value: input.value }
      : { format: input.format, value: input.value }
  const resolved = await resolveParcelId(tx, ref, signal)
  const base = { recordKind: input.recordKind, recordId: input.recordId }
  if (resolved.ok) {
    const via = resolved.value.via === 'active' ? 'direct' : 'retired_alias'
    const [row] = await tx
      .insert(parcelRecordLinks)
      .values({ ...base, parcelId: resolved.value.parcelId, status: 'linked', linkedVia: via })
      .onConflictDoNothing()
      .returning({ id: parcelRecordLinks.id })
    return { status: 'linked', linkId: row?.id ?? '' }
  }
  const [row] = await tx
    .insert(parcelRecordLinks)
    .values({
      ...base,
      rawRefFormat: input.format ?? null,
      rawRefValue: input.value,
      status: 'unresolved',
    })
    .returning({ id: parcelRecordLinks.id })
  return { status: 'unresolved', linkId: row?.id ?? '' }
}

export async function resolveUnresolvedLink(
  db: Db,
  actor: Actor,
  linkId: string,
  parcelId: string,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_unresolved'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(parcelRecordLinks)
      .set({ status: 'linked', parcelId, linkedVia: 'manual_resolution' })
      .where(and(eq(parcelRecordLinks.id, linkId), eq(parcelRecordLinks.status, 'unresolved')))
      .returning({ id: parcelRecordLinks.id })
    if (updated.length === 0) return err('not_unresolved')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'parcel.record_link.resolve',
        entityType: 'parcel_record_link',
        entityId: linkId,
        after: { parcelId },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function retryUnresolvedLinks(
  db: Db | Tx,
  signal: AbortSignal,
): Promise<{ resolved: number }> {
  signal.throwIfAborted()
  const pending = await db
    .select()
    .from(parcelRecordLinks)
    .where(eq(parcelRecordLinks.status, 'unresolved'))
  let resolved = 0
  for (const link of pending) {
    if (link.rawRefValue === null) continue
    const ref =
      link.rawRefFormat === null
        ? { value: link.rawRefValue }
        : { format: link.rawRefFormat, value: link.rawRefValue }
    const found = await resolveParcelId(db, ref, signal)
    if (!found.ok) continue
    const via = found.value.via === 'active' ? 'direct' : 'retired_alias'
    const existing = await db
      .select({ id: parcelRecordLinks.id })
      .from(parcelRecordLinks)
      .where(
        and(
          eq(parcelRecordLinks.recordKind, link.recordKind),
          eq(parcelRecordLinks.recordId, link.recordId),
          eq(parcelRecordLinks.parcelId, found.value.parcelId),
        ),
      )
    if (existing.length > 0) {
      await db.delete(parcelRecordLinks).where(eq(parcelRecordLinks.id, link.id))
    } else {
      await db
        .update(parcelRecordLinks)
        .set({ status: 'linked', parcelId: found.value.parcelId, linkedVia: via })
        .where(eq(parcelRecordLinks.id, link.id))
    }
    resolved += 1
  }
  return { resolved }
}

export async function carryForward(
  db: Db,
  actor: Actor,
  input: { linkId: string; toParcelId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_a_descendant'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const [link] = await db
    .select()
    .from(parcelRecordLinks)
    .where(eq(parcelRecordLinks.id, input.linkId))
  if (link?.parcelId == null || link.status !== 'linked') return err('not_a_descendant')
  const ancestors = await listAncestors(db, input.toParcelId, signal)
  if (!ancestors.some((a) => a.parcelId === link.parcelId)) return err('not_a_descendant')
  await db.transaction(async (tx) => {
    await tx
      .insert(parcelRecordCarryForwards)
      .values({ linkId: input.linkId, toParcelId: input.toParcelId, createdBy: actor.userId })
      .onConflictDoNothing()
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'parcel.record_link.carry_forward',
        entityType: 'parcel_record_link',
        entityId: input.linkId,
        after: { toParcelId: input.toParcelId },
      },
      signal,
    )
  })
  return ok(undefined)
}
