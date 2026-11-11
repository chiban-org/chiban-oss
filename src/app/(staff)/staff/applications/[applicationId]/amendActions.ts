'use server'

import { amendApplication } from '@/features/applications/submitApplication'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { APPLICATION_FORM, INVALID } from './actionInput'
import { fieldErrorsOf, valuesOf } from './correctionInput'

const NOT_AMENDABLE =
  'Only a submitted application or one under review can be edited. Reload the page.'

export async function amendApplicationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, APPLICATION_FORM, async ({ db, actor, signal }, input) => {
    const values = valuesOf(formData)
    if (values === null) return INVALID
    const done = await amendApplication(
      db,
      actor,
      { applicationId: input.applicationId, values },
      signal,
    )
    if (done.ok) return { ok: true, message: 'Application updated.' }
    if (done.error === 'not_amendable') return { ok: false, error: NOT_AMENDABLE }
    if (typeof done.error === 'string') return { ok: false, error: errorCopy(done.error) }
    return {
      ok: false,
      error: 'Check the highlighted answers.',
      fieldErrors: fieldErrorsOf(done.error.fieldErrors),
    }
  })
}
