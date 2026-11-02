import { asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { parcelLineageEvents, parcelLineageLinks, parcels } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type AddAliasError, addAlias, retireAliases } from '@/features/parcels/aliases'
import { displayIdsFor } from '@/features/parcels/displayId'
import { wouldCreateCycle } from '@/features/parcels/lineageCycle'
import { hasValidShape, type LineageInput, retiredParents } from '@/features/parcels/lineageShape'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type { LineageInput } from '@/features/parcels/lineageShape'

export type LineageError =
  | 'forbidden'
  | 'invalid_shape'
  | 'future_date'
  | 'cycle'
  | 'unknown_parcel'

export async function recordLineageEvent(
  db: Db,
  actor: Actor,
  input: LineageInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ eventId: string }, LineageError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  if (!hasValidShape(input)) return err('invalid_shape')
  const town = await getTownSettings(db, signal)
  if (town.ok && input.effectiveDate > todayInTimeZone(town.value.timeZone, now)) {
    return err('future_date')
  }
  return await transactionResult(db, async (tx) => {
    const listed = [...new Set([...input.parents, ...input.children])].sort()
    const locked = await tx
      .select({ id: parcels.id })
      .from(parcels)
      .where(inArray(parcels.id, listed))
      .orderBy(asc(parcels.id))
      .for('update')
    if (locked.length !== listed.length) return err('unknown_parcel')
    if (
      input.kind !== 'lot_line_adjustment' &&
      (await wouldCreateCycle(tx, input.parents, input.children))
    ) {
      return err('cycle')
    }
    const [event] = await tx
      .insert(parcelLineageEvents)
      .values({
        kind: input.kind,
        effectiveDate: input.effectiveDate,
        effectiveBasis: input.effectiveBasis,
        reference: input.reference ?? null,
        createdBy: actor.userId,
      })
      .returning({ id: parcelLineageEvents.id })
    const eventId = event?.id ?? ''
    await tx
      .insert(parcelLineageLinks)
      .values([
        ...input.parents.map((parcelId) => ({ eventId, parcelId, role: 'parent' as const })),
        ...input.children.map((parcelId) => ({ eventId, parcelId, role: 'child' as const })),
      ])
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'lineage.record',
        entityType: 'lineage_event',
        entityId: eventId,
        after: input,
      },
      signal,
    )
    for (const parcelId of retiredParents(input)) {
      await tx
        .update(parcels)
        .set({ status: 'retired', retiredOn: input.effectiveDate })
        .where(eq(parcels.id, parcelId))
      await retireAliases(tx, parcelId, 'lineage', input.effectiveDate, actor, signal)
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'parcel.retire',
          entityType: 'parcel',
          entityId: parcelId,
          before: { status: 'active' },
          after: { status: 'retired', retiredOn: input.effectiveDate, eventId },
        },
        signal,
      )
    }
    return ok({ eventId })
  })
}

export async function createParcelPlaceholder(
  db: Db,
  actor: Actor,
  input: { aliases: { format: string; value: string }[] },
  signal: AbortSignal,
): Promise<Result<{ parcelId: string }, AddAliasError | 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'parcel.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx.insert(parcels).values({}).returning({ id: parcels.id })
    const parcelId = row?.id ?? ''
    for (const alias of input.aliases) {
      const added = await addAlias(tx, { parcelId, ...alias, source: 'manual' }, actor, signal)
      if (!added.ok) return err(added.error)
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'parcel.create_placeholder',
        entityType: 'parcel',
        entityId: parcelId,
        after: input,
      },
      signal,
    )
    return ok({ parcelId })
  })
}

export interface LineageRef {
  parcelId: string
  displayId: string | null
  eventId: string
  eventKind: 'subdivision' | 'lot_line_adjustment' | 'merge'
  effectiveDate: CivilDate
}

async function refsFor(db: Db, parcelId: string, mine: 'parent' | 'child'): Promise<LineageRef[]> {
  const theirs = mine === 'parent' ? 'child' : 'parent'
  const mineLinks = await db
    .select({ eventId: parcelLineageLinks.eventId })
    .from(parcelLineageLinks)
    .where(eq(parcelLineageLinks.parcelId, parcelId))
  const eventIds = mineLinks.map((l) => l.eventId)
  if (eventIds.length === 0) return []
  const rows = await db
    .select({
      parcelId: parcelLineageLinks.parcelId,
      role: parcelLineageLinks.role,
      eventId: parcelLineageEvents.id,
      eventKind: parcelLineageEvents.kind,
      effectiveDate: parcelLineageEvents.effectiveDate,
    })
    .from(parcelLineageLinks)
    .innerJoin(parcelLineageEvents, eq(parcelLineageEvents.id, parcelLineageLinks.eventId))
    .where(inArray(parcelLineageLinks.eventId, eventIds))
    .orderBy(asc(parcelLineageEvents.effectiveDate))
  const own = await db
    .select()
    .from(parcelLineageLinks)
    .where(eq(parcelLineageLinks.parcelId, parcelId))
  const ownEvents = new Set(own.filter((l) => l.role === mine).map((l) => l.eventId))
  const picked = rows.filter(
    (r) => r.role === theirs && ownEvents.has(r.eventId) && r.parcelId !== parcelId,
  )
  const display = await displayIdsFor(
    db,
    picked.map((r) => r.parcelId),
  )
  return picked.map((r) => ({
    parcelId: r.parcelId,
    displayId: display.get(r.parcelId) ?? null,
    eventId: r.eventId,
    eventKind: r.eventKind,
    effectiveDate: r.effectiveDate as CivilDate,
  }))
}

export async function getLineage(
  db: Db,
  parcelId: string,
  signal: AbortSignal,
): Promise<{ parents: LineageRef[]; children: LineageRef[] }> {
  signal.throwIfAborted()
  return {
    parents: await refsFor(db, parcelId, 'child'),
    children: await refsFor(db, parcelId, 'parent'),
  }
}
