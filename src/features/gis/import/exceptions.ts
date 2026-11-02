import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { importExceptions, parcels } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { ImportExceptionKind, LayerKey } from '@/features/gis/exceptionKinds'
import { hashJson } from '@/features/gis/import/hash'
import { err, ok, type Result } from '@/types/result'

export interface ExceptionInput {
  layerKey: LayerKey
  runId: string
  rowKey: string
  kind: ImportExceptionKind
  payload: unknown
  detail: string
}

export async function recordException(tx: Tx, input: ExceptionInput): Promise<void> {
  await tx
    .insert(importExceptions)
    .values({
      layerKey: input.layerKey,
      firstRunId: input.runId,
      lastSeenRunId: input.runId,
      rowKey: input.rowKey,
      kind: input.kind,
      contentHash: hashJson(input.payload),
      payload: input.payload,
      detail: input.detail,
    })
    .onConflictDoUpdate({
      target: [
        importExceptions.layerKey,
        importExceptions.rowKey,
        importExceptions.kind,
        importExceptions.contentHash,
      ],
      targetWhere: sql`${importExceptions.status} = 'open'`,
      set: { lastSeenRunId: input.runId },
    })
}

export async function resolveCleanedExceptions(
  tx: Tx,
  layerKey: LayerKey,
  runId: string,
  processedKeys: string[],
): Promise<void> {
  if (processedKeys.length === 0) return
  await tx
    .update(importExceptions)
    .set({ status: 'resolved_by_rerun' })
    .where(
      and(
        eq(importExceptions.layerKey, layerKey),
        eq(importExceptions.status, 'open'),
        ne(importExceptions.lastSeenRunId, runId),
        sql`${importExceptions.rowKey} IN (SELECT jsonb_array_elements_text(${JSON.stringify(processedKeys)}::jsonb))`,
      ),
    )
}

interface HeldPayload {
  parcelId: string
  current: { ownerName: string | null; mailingAddress: string | null }
  proposed: {
    siteAddress: string | null
    ownerName: string | null
    mailingAddress: string | null
    geometry: GeoJSON.MultiPolygon
  }
}

async function applyHeld(
  tx: Tx,
  actor: Actor,
  row: typeof importExceptions.$inferSelect,
  signal: AbortSignal,
): Promise<Result<void, 'no_longer_valid'>> {
  const held = row.payload as HeldPayload
  const [parcel] = await tx
    .select()
    .from(parcels)
    .where(eq(parcels.id, held.parcelId))
    .for('update')
  const stale =
    parcel === undefined ||
    parcel.status !== 'active' ||
    parcel.ownerName !== held.current.ownerName ||
    parcel.mailingAddress !== held.current.mailingAddress
  if (stale) return err('no_longer_valid')
  const proposed = held.proposed
  await tx
    .update(parcels)
    .set({
      geom: proposed.geometry,
      siteAddress: proposed.siteAddress ?? parcel.siteAddress,
      ownerName: proposed.ownerName,
      mailingAddress: proposed.mailingAddress,
      updatedAt: new Date(),
    })
    .where(eq(parcels.id, held.parcelId))
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'parcel.accept_held_row',
      entityType: 'parcel',
      entityId: held.parcelId,
      before: { ownerName: parcel.ownerName, mailingAddress: parcel.mailingAddress },
      after: proposed,
    },
    signal,
  )
  await tx
    .update(importExceptions)
    .set({ status: 'accepted', dispositionBy: actor.userId })
    .where(eq(importExceptions.id, row.id))
  return ok(undefined)
}

async function acceptOne(
  db: Db,
  actor: Actor,
  exceptionId: string,
  signal: AbortSignal,
): Promise<Result<void, 'not_open' | 'no_longer_valid'>> {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(importExceptions)
      .where(eq(importExceptions.id, exceptionId))
      .for('update')
    if (row?.status !== 'open' || row.kind !== 'owner_changed') return err('not_open')
    return await applyHeld(tx, actor, row, signal)
  })
}

export async function acceptHeldRow(
  db: Db,
  actor: Actor,
  exceptionId: string,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_open' | 'no_longer_valid'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await acceptOne(db, actor, exceptionId, signal)
}

export async function acceptAllOwnerChanges(
  db: Db,
  actor: Actor,
  runId: string,
  signal: AbortSignal,
): Promise<Result<{ accepted: number }, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const open = await db
    .select({ id: importExceptions.id })
    .from(importExceptions)
    .where(
      and(
        eq(importExceptions.kind, 'owner_changed'),
        eq(importExceptions.status, 'open'),
        eq(importExceptions.lastSeenRunId, runId),
      ),
    )
  let accepted = 0
  for (const { id } of open) {
    const r = await acceptOne(db, actor, id, signal)
    if (r.ok) accepted += 1
  }
  return ok({ accepted })
}

export async function dismissException(
  db: Db,
  actor: Actor,
  exceptionId: string,
  reason: string,
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'reason_required'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  if (reason.trim() === '') return err('reason_required')
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(importExceptions)
      .set({ status: 'dismissed', dispositionBy: actor.userId, dispositionReason: reason.trim() })
      .where(and(eq(importExceptions.id, exceptionId), inArray(importExceptions.status, ['open'])))
      .returning({ id: importExceptions.id })
    if (updated.length === 0) return
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'import_exception.dismiss',
        entityType: 'import_exception',
        entityId: exceptionId,
        after: { reason: reason.trim() },
      },
      signal,
    )
  })
  return ok(undefined)
}
