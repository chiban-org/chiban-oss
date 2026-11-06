'use server'

import { z } from 'zod'
import {
  acceptAllOwnerChanges,
  acceptHeldRow,
  dismissException,
} from '@/features/gis/import/exceptions'
import { recordId, requiredText } from '@/features/input/schemas'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'

const MAX_REASON = 1000
const EXCEPTION_FORM = z.object({ exceptionId: recordId('an exception') })
const RUN_FORM = z.object({ runId: recordId('an import run') })
const DISMISS_FORM = z.object({
  exceptionId: recordId('an exception'),
  reason: requiredText('a reason', { max: MAX_REASON }),
})

export async function acceptHeldRowAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, EXCEPTION_FORM, async ({ db, actor, signal }, input) => {
    const result = await acceptHeldRow(db, actor, input.exceptionId, signal)
    return result.ok
      ? { ok: true, message: 'Held row applied.' }
      : { ok: false, error: errorCopy(result.error) }
  })
}

export async function acceptAllOwnerChangesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RUN_FORM, async ({ db, actor, signal }, input) => {
    const result = await acceptAllOwnerChanges(db, actor, input.runId, signal)
    return result.ok
      ? { ok: true, message: `Accepted ${result.value.accepted} owner changes.` }
      : { ok: false, error: errorCopy(result.error) }
  })
}

export async function dismissExceptionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, DISMISS_FORM, async ({ db, actor, signal }, input) => {
    const result = await dismissException(db, actor, input.exceptionId, input.reason, signal)
    if (result.ok) return { ok: true, message: 'Exception dismissed.' }
    const copy = errorCopy(result.error)
    return result.error === 'reason_required'
      ? refuseField('reason', copy)
      : { ok: false, error: copy }
  })
}
