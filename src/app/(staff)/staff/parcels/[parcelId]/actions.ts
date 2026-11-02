'use server'

import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'
import { createAliasOverride } from '@/features/parcels/aliasOverrides'
import { idFormatHint } from '@/features/parcels/idFormats'
import { submitLineage } from '@/features/parcels/lineageForm'
import { carryForward, resolveUnresolvedLink } from '@/features/parcels/recordLinks'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'

async function parcelIdFrom(db: Db, formData: FormData, signal: AbortSignal): Promise<string> {
  const ref = text(formData, 'parcelRef')
  if (ref === '') return text(formData, 'parcelId')
  const found = await resolveParcelId(db, { value: ref }, signal)
  return found.ok ? found.value.parcelId : ''
}

export async function recordLineageAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await submitLineage(
      db,
      actor,
      {
        kind: text(formData, 'kind') as 'subdivision',
        effectiveDate: text(formData, 'effectiveDate'),
        effectiveBasis: text(formData, 'effectiveBasis') as 'recording',
        reference: text(formData, 'reference'),
        parents: text(formData, 'parents'),
        children: text(formData, 'children'),
      },
      signal,
    )
    if (result.ok) return { ok: true, message: 'Lineage event recorded.' }
    const e = result.error
    if ('id' in e)
      return {
        ok: false,
        error: `${e.code === 'ambiguous_id' ? 'Several parcels match' : 'No parcel found for'} ${e.id}.`,
      }
    return { ok: false, error: errorCopy(e.code) }
  })
}

async function overrideErrorCopy(db: Db, error: string, formatKey: string): Promise<string> {
  if (error !== 'id_format_mismatch') return errorCopy(error)
  const [format] = await db.select().from(parcelIdFormats).where(eq(parcelIdFormats.key, formatKey))
  return format === undefined ? errorCopy(error) : `${errorCopy(error)} ${idFormatHint(format)}`
}

export async function createAliasOverrideAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const expiresOn = text(formData, 'expiresOn')
    const result = await createAliasOverride(
      db,
      actor,
      {
        format: text(formData, 'format'),
        value: text(formData, 'value'),
        parcelId: await parcelIdFrom(db, formData, signal),
        reason: text(formData, 'reason'),
        ...(expiresOn === '' ? {} : { expiresOn }),
      },
      signal,
    )
    return result.ok
      ? { ok: true, message: 'Override saved.' }
      : { ok: false, error: await overrideErrorCopy(db, result.error, text(formData, 'format')) }
  })
}

export async function carryForwardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await carryForward(
      db,
      actor,
      { linkId: text(formData, 'linkId'), toParcelId: text(formData, 'toParcelId') },
      signal,
    )
    return result.ok
      ? { ok: true, message: 'Record carried forward.' }
      : { ok: false, error: errorCopy(result.error) }
  })
}

export async function resolveUnresolvedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const result = await resolveUnresolvedLink(
      db,
      actor,
      text(formData, 'linkId'),
      await parcelIdFrom(db, formData, signal),
      signal,
    )
    return result.ok
      ? { ok: true, message: 'Record linked.' }
      : { ok: false, error: errorCopy(result.error) }
  })
}
