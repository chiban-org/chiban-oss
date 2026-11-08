import { type IntakeSaveResult, SAVE_FOR_LATER } from '@/components/counter/intake/intakeTypes'
import { loadApplicationContext } from '@/features/applications/context'
import { getVersion } from '@/features/config/store'
import { intakeHref } from '@/features/counter/intake/intakeHref'
import { isCounterIntake } from '@/features/counter/intake/intakeView'
import type { FormBody } from '@/features/forms/formSchema'
import { type FieldError, validateSubmission } from '@/features/forms/validateSubmission'
import { saveDraftValues } from '@/features/portal/drafts'
import { fieldErrorCopy, rawValuesFromForm } from '@/features/portal/formData'
import { type ActionContext, errorCopy, text } from '@/server/actionRunner'
import { COUNTER_START } from './counterHref'

function fieldErrors(errors: readonly FieldError[]): Record<string, string> {
  return Object.fromEntries(errors.map((e) => [e.field, fieldErrorCopy(e.code)]))
}

export async function saveIntakeValues(
  ctx: ActionContext,
  input: { applicationId: string; formData: FormData },
): Promise<IntakeSaveResult> {
  const { db, actor, signal } = ctx
  const [app, intake] = await Promise.all([
    loadApplicationContext(db, input.applicationId, signal),
    isCounterIntake(db, input.applicationId),
  ])
  const form = app === null ? null : (await getVersion(db, app.pins.form, signal))?.body
  if (app === null || !intake || form === undefined || form === null) {
    return { ok: false, error: errorCopy('not_found') }
  }
  const values = rawValuesFromForm(input.formData, form as FormBody, { includeStaffOnly: true })
  const saved = await saveDraftValues(db, actor, { applicationId: app.id, values }, signal)
  if (!saved.ok) {
    if (saved.error === 'not_found') return { ok: false, error: errorCopy('not_found') }
    if (saved.error === 'not_draft')
      return { ok: false, error: 'This application was already submitted.' }
    return {
      ok: false,
      error: 'Check the highlighted fields and try again.',
      fieldErrors: fieldErrors(saved.error.fieldErrors),
    }
  }
  if (text(input.formData, 'intent') === SAVE_FOR_LATER) {
    return { ok: true, message: 'Saved.', next: COUNTER_START }
  }
  const complete = validateSubmission(form as FormBody, values, { asStaff: true })
  if (!complete.ok) {
    return {
      ok: false,
      error: 'Saved. Fill in the highlighted fields before you submit.',
      fieldErrors: fieldErrors(complete.error),
    }
  }
  return { ok: true, message: 'Saved.', next: intakeHref(app.id, 'documents') }
}
