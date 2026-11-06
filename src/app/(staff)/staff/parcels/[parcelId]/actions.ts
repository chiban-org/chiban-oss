'use server'

import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { parcelIdFormats } from '@/db/schema'
import { createAliasOverride } from '@/features/parcels/aliasOverrides'
import { displayFormatHint } from '@/features/parcels/displayFormat'
import { idFormatHint } from '@/features/parcels/idFormats'
import { type LineageFormError, submitLineage } from '@/features/parcels/lineageForm'
import { carryForward, resolveUnresolvedLink } from '@/features/parcels/recordLinks'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import {
  aliasOverrideForm,
  carryForwardForm,
  lineageForm,
  resolveUnresolvedForm,
} from './parcelForms'

async function parcelIdFrom(
  db: Db,
  input: { parcelRef: string | null; parcelId: string | null },
  signal: AbortSignal,
): Promise<string> {
  if (input.parcelRef === null) return input.parcelId ?? ''
  const found = await resolveParcelId(db, { value: input.parcelRef }, signal)
  return found.ok ? found.value.parcelId : ''
}

const splitIds = (raw: string) => raw.split(/[\s,;]+/).filter((id) => id !== '')

async function lineageFailure(
  db: Db,
  error: LineageFormError,
  parents: string,
): Promise<ActionResult> {
  if (!('id' in error)) {
    const copy = errorCopy(error.code)
    return error.code === 'future_date'
      ? refuseField('effectiveDate', copy)
      : { ok: false, error: copy }
  }
  const field = splitIds(parents).includes(error.id) ? 'parents' : 'children'
  if (error.code === 'ambiguous_id') return refuseField(field, `Several parcels match ${error.id}.`)
  if (error.code === 'parent_not_found')
    return refuseField(field, `No parcel found for ${error.id}.`)
  const hint = await displayFormatHint(db)
  return refuseField(
    field,
    `${error.id} is not an existing parcel, and it is not a new parcel ID in the right shape. ${hint}`.trim(),
  )
}

export async function recordLineageAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, lineageForm, async ({ db, actor, signal }, input) => {
    const result = await submitLineage(
      db,
      actor,
      { ...input, reference: input.reference ?? '' },
      signal,
    )
    return result.ok
      ? { ok: true, message: 'Lineage event recorded.' }
      : await lineageFailure(db, result.error, input.parents)
  })
}

const OVERRIDE_FIELD: Readonly<Record<string, string>> = {
  unknown_format: 'format',
  id_format_mismatch: 'value',
  alias_taken: 'value',
  reason_required: 'reason',
  invalid_parcel_id: 'parcelRef',
  unknown_parcel: 'parcelRef',
  invalid_date: 'expiresOn',
}

async function overrideCopy(db: Db, error: string, formatKey: string): Promise<string> {
  if (error !== 'id_format_mismatch') return errorCopy(error)
  const [format] = await db.select().from(parcelIdFormats).where(eq(parcelIdFormats.key, formatKey))
  return format === undefined ? errorCopy(error) : `${errorCopy(error)} ${idFormatHint(format)}`
}

export async function createAliasOverrideAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    aliasOverrideForm,
    async ({ db, actor, signal }, input) => {
      const result = await createAliasOverride(
        db,
        actor,
        {
          format: input.format,
          value: input.value,
          parcelId: await parcelIdFrom(db, input, signal),
          reason: input.reason,
          ...(input.expiresOn === null ? {} : { expiresOn: input.expiresOn }),
        },
        signal,
      )
      if (result.ok) return { ok: true, message: 'Override saved.' }
      const copy = await overrideCopy(db, result.error, input.format)
      const field = OVERRIDE_FIELD[result.error]
      return field === undefined ? { ok: false, error: copy } : refuseField(field, copy)
    },
  )
}

export async function carryForwardAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, carryForwardForm, async ({ db, actor, signal }, input) => {
    const result = await carryForward(db, actor, input, signal)
    if (result.ok) return { ok: true, message: 'Record carried forward.' }
    const copy = errorCopy(result.error)
    return result.error === 'not_a_descendant'
      ? refuseField('toParcelId', copy)
      : { ok: false, error: copy }
  })
}

export async function resolveUnresolvedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    resolveUnresolvedForm,
    async ({ db, actor, signal }, input) => {
      const parcelId = await parcelIdFrom(
        db,
        { parcelRef: input.parcelRef, parcelId: null },
        signal,
      )
      if (parcelId === '') return refuseField('parcelRef', errorCopy('invalid_parcel_id'))
      const result = await resolveUnresolvedLink(db, actor, input.linkId, parcelId, signal)
      return result.ok
        ? { ok: true, message: 'Record linked.' }
        : { ok: false, error: errorCopy(result.error) }
    },
  )
}
