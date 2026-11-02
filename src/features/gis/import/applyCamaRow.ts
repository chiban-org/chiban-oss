import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { parcels } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { ImportExceptionKind } from '@/features/gis/exceptionKinds'
import type { RowResult } from '@/features/gis/import/applyParcelRow'
import type { ImportContext } from '@/features/gis/import/context'
import { recordException } from '@/features/gis/import/exceptions'
import type { PreparedCamaRow } from '@/features/gis/import/prepareCamaRows'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'

type Stored = typeof parcels.$inferSelect

function except(
  ctx: ImportContext,
  row: PreparedCamaRow,
  kind: ImportExceptionKind,
  detail: string,
  extra: object = {},
): Promise<RowResult> {
  return recordException(ctx.tx, {
    layerKey: ctx.layerKey,
    runId: ctx.runId,
    rowKey: row.rowKey,
    kind,
    detail,
    payload: {
      rowRefs: [row.rowRef],
      properties: {
        id: row.id?.value ?? null,
        ownerName: row.ownerName,
        mailingAddress: row.mailingAddress,
        siteAddress: row.siteAddress,
      },
      ...extra,
    },
  }).then(() => ({ outcome: 'excepted', kind }))
}

function differs(stored: string | null, incoming: string | null): boolean {
  return stored !== null && incoming !== null && stored !== incoming
}

function fillPatch(stored: Stored, row: PreparedCamaRow): Partial<typeof parcels.$inferInsert> {
  const patch: Partial<typeof parcels.$inferInsert> = {}
  if (stored.ownerName === null && row.ownerName !== null) patch.ownerName = row.ownerName
  if (stored.mailingAddress === null && row.mailingAddress !== null) {
    patch.mailingAddress = row.mailingAddress
  }
  if (row.siteAddress !== null && row.siteAddress !== stored.siteAddress) {
    patch.siteAddress = row.siteAddress
  }
  return patch
}

async function resolvedParcel(
  ctx: ImportContext,
  row: PreparedCamaRow,
  id: NonNullable<PreparedCamaRow['id']>,
): Promise<{ stored: Stored } | { result: RowResult }> {
  const resolved = await resolveParcelId(ctx.tx, id, ctx.signal)
  if (!resolved.ok) {
    if (resolved.error === 'not_found') {
      return {
        result: await except(ctx, row, 'cama_parcel_unknown', `${id.value} matches no parcel`),
      }
    }
    return {
      result: await except(ctx, row, 'alias_conflict', `${id.value} matches more than one parcel`),
    }
  }
  const [stored] = await ctx.tx
    .select()
    .from(parcels)
    .where(eq(parcels.id, resolved.value.parcelId))
    .for('update')
  if (stored === undefined) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Resolved parcel vanished', {
      parcelId: resolved.value.parcelId,
    })
  }
  if (resolved.value.via === 'retired' || stored.status !== 'active') {
    return {
      result: await except(
        ctx,
        row,
        'id_resolves_to_retired',
        `${id.value} belongs to a retired parcel`,
      ),
    }
  }
  return { stored }
}

export async function applyCamaRow(ctx: ImportContext, row: PreparedCamaRow): Promise<RowResult> {
  ctx.signal.throwIfAborted()
  if (row.failure !== null) return await except(ctx, row, row.failure.kind, row.failure.detail)
  if (row.id === null) return await except(ctx, row, 'id_format_mismatch', 'No parcel ID')
  const found = await resolvedParcel(ctx, row, row.id)
  if ('result' in found) return found.result
  const stored = found.stored
  if (
    differs(stored.ownerName, row.ownerName) ||
    differs(stored.mailingAddress, row.mailingAddress)
  ) {
    return await except(
      ctx,
      row,
      'owner_changed',
      'Owner or mailing address differs from the stored value',
      {
        parcelId: stored.id,
        current: { ownerName: stored.ownerName, mailingAddress: stored.mailingAddress },
        proposed: {
          siteAddress: row.siteAddress,
          ownerName: row.ownerName ?? stored.ownerName,
          mailingAddress: row.mailingAddress ?? stored.mailingAddress,
        },
      },
    )
  }
  const patch = fillPatch(stored, row)
  if (Object.keys(patch).length === 0) return { outcome: 'unchanged' }
  await ctx.tx
    .update(parcels)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(parcels.id, stored.id))
  await writeAudit(
    ctx.tx,
    {
      actor: ctx.actor,
      action: 'parcel.import_update',
      entityType: 'parcel',
      entityId: stored.id,
      before: {
        siteAddress: stored.siteAddress,
        ownerName: stored.ownerName,
        mailingAddress: stored.mailingAddress,
      },
      after: patch,
    },
    ctx.signal,
  )
  return { outcome: 'applied' }
}
